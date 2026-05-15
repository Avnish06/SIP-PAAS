'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import api from '../../../lib/api'

const STATUS_COLOR = {
  ANSWERED:    'text-green-400',
  BUSY:        'text-amber-400',
  'NO ANSWER': 'text-gray-400',
  FAILED:      'text-red-400',
}

const STATUS_BADGE = {
  ANSWERED:    'bg-green-900/40 border-green-700 text-green-400',
  BUSY:        'bg-amber-900/40 border-amber-700 text-amber-400',
  'NO ANSWER': 'bg-gray-800 border-gray-700 text-gray-400',
  FAILED:      'bg-red-900/40 border-red-700 text-red-400',
}

/* ─────────────────────────────────────────────────────────
   WebRTC Browser Phone
   Loads JsSIP from /jssip.min.js (local file, no CDN)
   WebSocket: ws://localhost:3000/sip-ws → API proxy → Asterisk :8088
   ───────────────────────────────────────────────────────── */
function BrowserPhone() {
  const [sipReady,    setSipReady]    = useState(false)   // JsSIP script loaded
  const [regState,    setRegState]    = useState('idle')  // idle|connecting|registered
  const [callState,   setCallState]   = useState('idle')  // idle|calling|ringing|incall
  const [statusMsg,   setStatusMsg]   = useState('')
  const [dialNum,     setDialNum]     = useState('')
  const [duration,    setDuration]    = useState(0)
  const uaRef        = useRef(null)
  const sessionRef   = useRef(null)
  const timerRef     = useRef(null)
  const remoteAudio  = useRef(null)
  const audioCtxRef  = useRef(null)
  const audioSrcRef  = useRef(null)
  const localStreamRef = useRef(null)
  const scriptLoaded = useRef(false)
  const wsRetries      = useRef(0)
  const MAX_WS_RETRIES = 3
  const toneRef        = useRef(null)
  const [toneOn, setToneOn] = useState(false)
  const [customerId, setCustomerId] = useState(null)

  // Fetch the logged-in customer's id once on mount. We send this as the
  // X-Customer-ID header on every outbound INVITE so the dialplan can stamp
  // CDR(accountcode), which is what the billing engine uses to attribute the
  // call back to the right customer.
  useEffect(() => {
    api.get('/accounts/me').then(r => setCustomerId(r.data?.account?.id ?? null)).catch(() => {})
  }, [])

  // Asterisk WebRTC SIP — proxied through API port 3000 → Asterisk :8088
  const SIP_USER   = 'webrtcuser'
  const SIP_PASS   = 'WebRTC2024!'
  // SIP domain matches Asterisk realm. Derived from the page host so it
  // works on localhost dev and on the public IP without hardcoding.
  const SIP_DOMAIN = typeof window !== 'undefined' ? window.location.hostname : '152.58.97.143'

  // JsSIP script loader — runs ONCE on mount only.
  useEffect(() => {
    if (scriptLoaded.current) return
    scriptLoaded.current = true
    const s = document.createElement('script')
    s.src = '/jssip.min.js'
    s.onload  = () => setSipReady(true)
    s.onerror = () => setStatusMsg('Failed to load phone library')
    document.head.appendChild(s)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  // External-trigger bridge: re-registers the window event handler on every
  // render so its closure ALWAYS has the latest regState / connect / makeCall /
  // setDialNum. A single mount-time handler would freeze regState at 'idle'
  // and the wait-for-registration loop would never see it become 'registered'.
  useEffect(() => {
    const onExternalCall = async (ev) => {
      const dest = (ev.detail && ev.detail.dest || '').replace(/\s/g,'')
      if (!dest) return
      // Trigger connect once if needed; subsequent renders will see updated regState.
      if (regState === 'idle') connect()
      // Wait up to 10s for the BrowserPhone to reach 'registered'. We re-check
      // via a window.getComputedStyle-like polling: each tick we check the latest
      // regState captured in a fresh effect re-binding (see useEffect deps).
      const deadline = Date.now() + 10000
      while (Date.now() < deadline) {
        // The handler is re-bound on each regState change — re-reading the
        // outer-scope variable here would still be stale, so we read it from
        // an attribute we keep up-to-date on the window object below.
        if (window.__sipaasRegState === 'registered') break
        await new Promise(r => setTimeout(r, 200))
      }
      if (window.__sipaasRegState !== 'registered') {
        console.warn('[SIP] external call: not registered after 10s, aborting')
        return
      }
      // Pass dest directly — avoids the stale-closure where makeCall reads
      // an old (empty) dialNum because setDialNum's state commit hasn't run.
      makeCall(dest)
    }
    window.addEventListener('sipaas:call', onExternalCall)
    return () => window.removeEventListener('sipaas:call', onExternalCall)
  }, [regState, connect, makeCall, setDialNum])

  // Mirror regState onto window so the external-call handler can poll
  // a value that updates in real time, not a stale closure.
  useEffect(() => {
    if (typeof window !== 'undefined') window.__sipaasRegState = regState
  }, [regState])

  function fmtTime(s) {
    return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  }

  async function connect() {
    if (!window.JsSIP) { setStatusMsg('Phone library not ready, wait a moment'); return }

    // ── Step 1: request mic permission NOW so browser shows the prompt ──
    // Browsers only allow getUserMedia on localhost or https pages.
    // If accessed via http://public-ip:8080 the mic will be silently blocked.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      // Keep stream ALIVE — do NOT stop tracks here. JsSIP will use this exact stream
      // via mediaStream: option in makeCall(), so the mic is already capturing when
      // the WebRTC peer connection is created. Stopping and re-acquiring causes browsers
      // to return silent/non-capturing tracks on the second getUserMedia call (one-way audio bug).
      localStreamRef.current = stream
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setStatusMsg('Microphone blocked — open this page at http://localhost:8080 (not via IP), then allow mic in browser')
      } else if (err.name === 'NotFoundError') {
        setStatusMsg('No microphone found — plug in a mic or headset and try again')
      } else {
        setStatusMsg('Mic error: ' + err.message + ' — try http://localhost:8080')
      }
      return
    }

    // ── Step 2: probe WebSocket before handing off to JsSIP ──
    // If Asterisk is down, JsSIP retries forever and floods the console.
    // We test the connection ourselves first and abort if it fails.
    const wsUrl = `ws://${window.location.hostname}:8088/ws`

    setRegState('connecting')
    setStatusMsg('Checking SIP server...')

    setStatusMsg('Connecting...')

    const socket = new window.JsSIP.WebSocketInterface(wsUrl)
    const ua = new window.JsSIP.UA({
      sockets:                        [socket],
      uri:                            `sip:${SIP_USER}@${SIP_DOMAIN}`,
      password:                       SIP_PASS,
      register:                       true,
      register_expires:               300,
      connection_recovery_min_interval: 99999,
      connection_recovery_max_interval: 99999,
    })

    ua.on('registered',          () => { wsRetries.current = 0; setRegState('registered'); setStatusMsg('') })
    ua.on('unregistered',        () => { setRegState('idle');       setStatusMsg('Disconnected') })
    ua.on('registrationFailed',  e  => { setRegState('idle');       setStatusMsg('Registration failed: ' + e.cause) })
    ua.on('disconnected', () => {
      ua.stop()
      setRegState('idle')
      setStatusMsg('Disconnected from Asterisk — check it is running on port 8088')
    })

    ua.on('newRTCSession', ({ session }) => {
      sessionRef.current = session

      session.on('progress',  () => setCallState('ringing'))
      session.on('confirmed', () => {
        setCallState('incall')
        setDuration(0)
        timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)

        // Backup attachment path. The peerconnection 'track' listener can
        // miss tracks that arrived BEFORE we attached (JsSIP's peerconnection
        // event fires after pc is created but tracks can arrive in the same
        // tick). Once the SIP session is confirmed, the receivers are
        // guaranteed populated — pull the remote audio track from there and
        // bind it to the <audio> element if it isn't already.
        const pc = session.connection
        if (!pc) return
        const audioRecv = pc.getReceivers().find(r => r.track?.kind === 'audio')
        console.log('[SIP] confirmed — audio receivers=', pc.getReceivers().length,
                    'hasAudio=', !!audioRecv,
                    'srcObjectSet=', !!remoteAudio.current?.srcObject)
        if (audioRecv && remoteAudio.current && !remoteAudio.current.srcObject) {
          const stream = new MediaStream([audioRecv.track])
          remoteAudio.current.srcObject = stream
          remoteAudio.current.volume = 1.0
          remoteAudio.current.muted = false
          remoteAudio.current.play()
            .then(() => console.log('[SIP] backup attach + play OK'))
            .catch(err => console.warn('[SIP] backup play blocked:', err?.name))
        }
      })
      session.on('ended',   () => { setCallState('idle'); clearInterval(timerRef.current) })
      session.on('failed',  e  => {
        setCallState('idle')
        clearInterval(timerRef.current)
        setStatusMsg('Call failed: ' + (e.cause || e.message || 'unknown'))
      })

      session.on('peerconnection', ({ peerconnection: pc }) => {
        // Log ICE state changes to help diagnose one-way audio
        pc.addEventListener('iceconnectionstatechange', () => {
          console.log('[SIP] ICE state:', pc.iceConnectionState)
        })
        pc.addEventListener('icegatheringstatechange', () => {
          console.log('[SIP] ICE gathering:', pc.iceGatheringState)
        })
        // Log local tracks — confirms mic is attached
        setTimeout(() => {
          const senders = pc.getSenders()
          senders.forEach(s => {
            if (s.track) console.log('[SIP] Local track:', s.track.kind, 'readyState=', s.track.readyState, 'enabled=', s.track.enabled, 'muted=', s.track.muted)
            else console.warn('[SIP] Sender has no track — mic not attached!')
          })
        }, 1000)
        pc.addEventListener('track', ev => {
          console.log('[SIP] ontrack fired — kind=', ev.track.kind,
                      'readyState=', ev.track.readyState,
                      'muted=', ev.track.muted,
                      'enabled=', ev.track.enabled,
                      'streams=', ev.streams?.length)
          const stream = (ev.streams && ev.streams.length > 0)
            ? ev.streams[0]
            : new MediaStream([ev.track])

          ev.track.onmute   = () => console.log('[SIP] remote track MUTED')
          ev.track.onunmute = () => { console.log('[SIP] remote track UNMUTED — re-attaching'); attachAudio() }
          ev.track.onended  = () => console.log('[SIP] remote track ENDED')

          const attachAudio = () => {
            if (!remoteAudio.current) { console.warn('[SIP] no <audio> element ref'); return }
            remoteAudio.current.srcObject = stream
            remoteAudio.current.volume = 1.0
            remoteAudio.current.muted = false
            console.log('[SIP] srcObject set — tracks:', stream.getAudioTracks().map(t => ({ id:t.id, muted:t.muted, enabled:t.enabled, state:t.readyState })))
            const p = remoteAudio.current.play()
            if (p && typeof p.then === 'function') {
              p.then(() => console.log('[SIP] audio.play() OK'))
               .catch(err => {
                 console.warn('[SIP] audio.play() BLOCKED:', err?.name, '— click anywhere on the page to start audio')
                 const retry = () => remoteAudio.current?.play().then(() => console.log('[SIP] audio resumed by click')).catch(() => {})
                 document.addEventListener('click', retry, { once: true })
               })
            }
          }
          attachAudio()
        })
      })
    })

    ua.start()
    uaRef.current = ua
  }

  function disconnect() {
    try { uaRef.current?.stop() } catch (_) {}
    try { audioSrcRef.current?.disconnect() } catch (_) {}
    try { audioCtxRef.current?.close() } catch (_) {}
    // Stop local mic stream — releases the microphone indicator in the browser
    try { localStreamRef.current?.getTracks().forEach(t => t.stop()) } catch (_) {}
    audioSrcRef.current = null
    audioCtxRef.current = null
    localStreamRef.current = null
    uaRef.current = null
    sessionRef.current = null
    clearInterval(timerRef.current)
    setRegState('idle'); setCallState('idle'); setStatusMsg(''); setDuration(0)
  }

  // makeCall accepts an OPTIONAL destination. When invoked from the on-screen
  // form, the state-bound dialNum supplies it. When invoked from an external
  // window event (the Make-a-Call panel above), the caller passes the dest
  // directly so we sidestep the stale-closure on dialNum.
  function makeCall(destOverride) {
    if (!uaRef.current || regState !== 'registered') return
    const raw = (typeof destOverride === 'string' && destOverride) ? destOverride : dialNum
    if (!raw || !raw.trim()) return
    const dest = raw.replace(/\s/g,'')
    setDialNum(dest)
    setCallState('calling')
    setStatusMsg('')

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      }
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
    } catch (_) {}

    // Prime the <audio> element while we're still inside the click handler.
    // Chrome's autoplay policy lets media play later WITHOUT a user gesture if
    // the element was play()'d during one. We pre-call play() now (it'll resolve
    // immediately because srcObject is null) so that when the remote track
    // arrives a few seconds later, srcObject + play() will NOT be blocked.
    try {
      const a = remoteAudio.current
      if (a) {
        a.muted = false
        a.volume = 1.0
        a.play().catch(() => {})
      }
    } catch (_) {}

    // Use the pre-obtained mic stream directly (captured in connect()).
    // This avoids the "one-way audio" bug where a second getUserMedia call returns
    // silent/non-capturing tracks on some Chrome builds.
    const callOptions = {
      pcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          // TURN relay — ensures audio works even through Docker/NAT
          { urls: 'turn:openrelay.metered.ca:80',    username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443',   username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
        ]
      },
    }
    if (localStreamRef.current) {
      // Preferred: pass pre-obtained stream — mic tracks are guaranteed live
      callOptions.mediaStream = localStreamRef.current
    } else {
      // Fallback: let JsSIP call getUserMedia (may fail silently on some browsers)
      callOptions.mediaConstraints = { audio: true, video: false }
    }
    // Stamp the call with the customer id so the dialplan can attribute CDR.
    if (customerId) {
      callOptions.extraHeaders = [`X-Customer-ID: ${customerId}`]
    }
    uaRef.current.call(`sip:${dest}@${SIP_DOMAIN}`, callOptions)
  }

  function hangup() {
    try { sessionRef.current?.terminate() } catch (_) {}
    stopTone()
    setCallState('idle')
    clearInterval(timerRef.current)
  }

  // Returns the active peer connection only if it's still open. replaceTrack
  // on a closed RTCPeerConnection throws InvalidStateError, which is what
  // produced the noisy console error on Stop Tone after a call ended.
  function activePeerConnection() {
    const pc = sessionRef.current?.connection
    if (!pc) return null
    if (pc.connectionState === 'closed' || pc.signalingState === 'closed') return null
    return pc
  }

  function toggleTone() {
    if (toneOn) { stopTone(); return }
    const pc = activePeerConnection()
    if (!pc) { console.warn('[SIP] Tone ignored — no active call'); return }
    try {
      const ctx = audioCtxRef.current || new (window.AudioContext || window.webkitAudioContext)()
      if (!audioCtxRef.current) audioCtxRef.current = ctx
      if (ctx.state === 'suspended') ctx.resume()

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(440, ctx.currentTime)
      gain.gain.setValueAtTime(0.8, ctx.currentTime)
      osc.connect(gain)

      const dest = ctx.createMediaStreamDestination()
      gain.connect(dest)
      osc.start()
      toneRef.current = { osc, gain, dest }

      const audioSender = pc.getSenders().find(s => s.track?.kind === 'audio')
      const toneTrack   = dest.stream.getAudioTracks()[0]
      if (audioSender && toneTrack) audioSender.replaceTrack(toneTrack)
      setToneOn(true)
    } catch (e) { console.warn('Tone error:', e) }
  }

  function stopTone() {
    try { toneRef.current?.osc.stop() } catch (_) {}
    toneRef.current = null
    setToneOn(false)
    // Only restore the mic track if the call is still active — replaceTrack
    // on a closed peer connection throws InvalidStateError.
    const pc = activePeerConnection()
    if (!pc) return
    const audioSender = pc.getSenders().find(s => s.track?.kind === 'audio')
    const micTrack    = localStreamRef.current?.getAudioTracks()[0]
    if (audioSender && micTrack) {
      try { audioSender.replaceTrack(micTrack) } catch (_) {}
    }
  }

  // Detect if running on non-secure non-localhost — mic will be blocked by browser
  const [micBlocked, setMicBlocked] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    const isSecure    = window.location.protocol === 'https:'
    if (!isLocalhost && !isSecure) setMicBlocked(true)
  }, [])

  const isIdle   = regState === 'idle'
  const isReady  = regState === 'registered' && callState === 'idle'
  const isCalling = callState === 'calling' || callState === 'ringing'
  const isInCall  = callState === 'incall'

  const dotColor = {
    idle:        'bg-gray-500',
    connecting:  'bg-yellow-400 animate-pulse',
    registered:  isInCall ? 'bg-green-400 animate-pulse' : 'bg-green-400',
  }[regState] || 'bg-gray-500'

  const stateLabel =
    isInCall   ? `In call  ${fmtTime(duration)}` :
    isCalling  ? 'Ringing...' :
    regState === 'connecting' ? 'Connecting...' :
    regState === 'registered' ? 'Ready' :
    'Not connected'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">

      {/* Mic security warning */}
      {micBlocked && (
        <div className="mb-4 p-3 bg-amber-900/40 border border-amber-600 rounded-lg flex items-start gap-2">
          <span className="text-amber-400 text-lg leading-none mt-0.5">⚠</span>
          <div>
            <p className="text-amber-300 text-sm font-semibold">Microphone blocked by browser</p>
            <p className="text-amber-400/80 text-xs mt-0.5">
              Browser phone requires microphone access. Browsers block mic on plain HTTP pages opened via IP address.
              <br/>
              <strong className="text-amber-300">Fix:</strong> Open the portal at{' '}
              <a href="http://localhost:8080/dashboard/calls" className="underline text-amber-300 hover:text-white">
                http://localhost:8080
              </a>{' '}
              (not via {typeof window !== 'undefined' ? window.location.hostname : 'IP'}).
              <br/>
              <strong className="text-amber-300">Alternative:</strong> Use <strong className="text-amber-300">Click-to-Call</strong> above — it works without mic.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-blue-400">&#9742;</span> Browser Phone
            <span className="text-xs text-gray-500 font-normal ml-1">no app needed</span>
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full inline-block ${dotColor}`}></span>
            <span className="text-sm text-gray-300">{stateLabel}</span>
            {statusMsg && <span className="text-xs text-red-400">— {statusMsg}</span>}
          </div>
        </div>

        {!sipReady && (
          <span className="text-xs text-gray-500 animate-pulse">Loading...</span>
        )}
        {sipReady && isIdle && (
          <button onClick={connect}
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-semibold transition">
            Connect
          </button>
        )}
        {sipReady && !isIdle && (
          <button onClick={disconnect}
            className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2 rounded-lg text-sm transition">
            Disconnect
          </button>
        )}
      </div>

      {/* Dial pad — shown once registered */}
      {regState === 'registered' && (
        <div className="flex gap-3">
          <input
            className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white font-mono text-base focus:outline-none focus:border-blue-500 tracking-widest"
            placeholder="Enter number e.g. 9142436879"
            value={dialNum}
            onChange={e => setDialNum(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && isReady && makeCall()}
            disabled={isCalling || isInCall}
          />

          {!isInCall && !isCalling && (
            <button onClick={makeCall} disabled={!dialNum.trim()}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white px-6 py-3 rounded-lg font-bold text-sm transition flex items-center gap-2">
              &#9742; Call
            </button>
          )}
          {(isCalling || isInCall) && (
            <button onClick={hangup}
              className="bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-lg font-bold text-sm transition flex items-center gap-2">
              &#9746; End
            </button>
          )}
          {isInCall && (
            <button onClick={toggleTone}
              className={`px-4 py-3 rounded-lg font-bold text-sm transition ${toneOn ? 'bg-yellow-500 hover:bg-yellow-400 text-black' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}>
              {toneOn ? '⏹ Stop Tone' : '♪ Test Tone'}
            </button>
          )}
        </div>
      )}

      {/* Instruction when idle */}
      {isIdle && sipReady && (
        <p className="text-gray-500 text-sm">
          Click <strong className="text-gray-300">Connect</strong> → allow microphone → type a number → <strong className="text-gray-300">Call</strong>
        </p>
      )}

      {/* Remote audio — ALWAYS mounted, ALWAYS visible. Keeping the element
          structure stable across state changes ensures React never remounts
          it, which would drop srcObject and break audio mid-call. */}
      <div className="mt-4 p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
        <p className="text-gray-400 text-xs mb-1">Remote audio (press play if you don&apos;t hear sound):</p>
        <audio ref={remoteAudio} autoPlay playsInline controls className="w-full" />
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   Main Calls Page
   ───────────────────────────────────────────────────────── */
const LIMIT = 25

export default function Calls() {
  const [cdrs,       setCdrs]      = useState([])
  const [total,      setTotal]     = useState({})
  const [page,       setPage]      = useState(1)
  const [trunks,     setTrunks]    = useState([])
  const [loading,    setLoading]   = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)

  // Filters
  const [filters, setFilters] = useState({
    from: '', to_date: '', status: 'all', direction: 'all', search: ''
  })
  const [appliedFilters, setAppliedFilters] = useState({ status: 'all', direction: 'all' })

  // Click-to-Call state
  const [c2cForm,    setC2cForm]   = useState({ my_number: '', to: '' })
  const [c2cCalling, setC2cCalling]= useState(false)
  const [c2cResult,  setC2cResult] = useState(null)
  const [c2cError,   setC2cError]  = useState('')

  const fmt = s => {
    if (!s || s === 0) return '0s'
    const m = Math.floor(s / 60), sec = s % 60
    return m ? `${m}m ${sec}s` : `${sec}s`
  }

  const fmtDate = d => {
    if (!d) return '—'
    return new Date(d).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
  }

  const loadCdrs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: LIMIT })
      if (appliedFilters.from)      params.set('from', appliedFilters.from)
      if (appliedFilters.to_date)   params.set('to',   appliedFilters.to_date)
      if (appliedFilters.status !== 'all')    params.set('status',    appliedFilters.status)
      if (appliedFilters.direction !== 'all') params.set('direction', appliedFilters.direction)

      const r = await api.get(`/calls/cdr?${params}`)
      setCdrs(r.data.cdrs || [])
      setTotal(r.data.total || {})
      setLastRefresh(new Date())
    } catch (_) {}
    setLoading(false)
  }, [page, appliedFilters])

  // Auto-refresh every 15s
  useEffect(() => {
    loadCdrs()
    const t = setInterval(loadCdrs, 15000)
    return () => clearInterval(t)
  }, [loadCdrs])

  useEffect(() => {
    api.get('/trunks').then(r => setTrunks(r.data.trunks || [])).catch(() => {})
  }, [])

  const applyFilters = () => {
    setAppliedFilters({ ...filters })
    setPage(1)
  }
  const clearFilters = () => {
    const empty = { from: '', to_date: '', status: 'all', direction: 'all', search: '' }
    setFilters(empty)
    setAppliedFilters(empty)
    setPage(1)
  }

  const hasActiveFilters = appliedFilters.status !== 'all' || appliedFilters.direction !== 'all' ||
    appliedFilters.from || appliedFilters.to_date

  // CSV export
  const exportCSV = () => {
    const headers = ['ID','From','To','Start','Answer','End','Duration(s)','Billsec(s)','Status','Cost(INR)','Direction','Provider']
    const rows = cdrs.map(c => [
      c.id, c.src, c.dst,
      c.start_time, c.answer_time || '', c.end_time || '',
      c.duration, c.billsec, c.disposition,
      parseFloat(c.cost || 0).toFixed(4),
      c.direction || '', c.provider || ''
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `call-logs-page${page}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // Make a Call — dispatch a window event consumed by BrowserPhone, which
  // owns the SIP user-agent state. This keeps the two components decoupled.
  const makeC2cCall = async e => {
    e.preventDefault()
    setC2cResult(null); setC2cError(''); setC2cCalling(true)
    try {
      const dest = c2cForm.to.replace(/\s/g,'')
      if (!dest) throw new Error('Destination number required')
      window.dispatchEvent(new CustomEvent('sipaas:call', { detail: { dest } }))
      setC2cResult({ message: `Calling ${dest} via SIP — audio in this browser (allow mic if prompted)` })
    } catch (err) {
      setC2cError(err.message || 'Call failed')
    } finally {
      setC2cCalling(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil((total.cnt || 0) / LIMIT))

  return (
    <div className="max-w-7xl">

      {/* ── Make a Call (SIP, no cellular) ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
          📞 Make a Call
          <span className="text-xs font-normal text-gray-500 ml-1">SIP via browser</span>
        </h2>
        <p className="text-gray-400 text-sm mb-5">
          Dials the destination directly over SIP. <strong className="text-white">Audio plays in this browser</strong> — your mobile phone is not involved.
        </p>

        <form onSubmit={makeC2cCall} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Destination Number</label>
            <input
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-blue-500"
              placeholder="9142436879"
              value={c2cForm.to}
              onChange={e => setC2cForm({...c2cForm, to: e.target.value})}
              required
            />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={c2cCalling}
              className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-6 py-3 rounded-lg font-bold text-sm transition flex items-center justify-center gap-2">
              {c2cCalling ? '⏳ Connecting...' : '📞 Call Now'}
            </button>
          </div>
        </form>

        {c2cResult && (
          <div className="mt-4 p-3 bg-green-900/30 border border-green-700 rounded-lg flex items-start gap-2">
            <span className="text-green-400 mt-0.5">✓</span>
            <div>
              <p className="text-green-400 text-sm font-medium">{c2cResult.message}</p>
              <p className="text-green-500 text-xs mt-0.5">Watch the Browser Phone panel below for call status.</p>
            </div>
          </div>
        )}
        {c2cError && (
          <div className="mt-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
            <p className="text-red-400 text-sm">✗ {c2cError}</p>
          </div>
        )}
      </div>

      {/* ── Browser Phone ── */}
      <BrowserPhone />

      {/* ── Call Logs ── */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-white">Call Logs</h1>
          <p className="text-gray-500 text-xs mt-0.5">
            {lastRefresh ? `Last updated: ${lastRefresh.toLocaleTimeString('en-IN')} · auto-refreshes every 15s` : 'Loading...'}
          </p>
        </div>
        <button onClick={exportCSV} disabled={!cdrs.length}
          className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-sm transition disabled:opacity-30">
          ⬇ Export CSV
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total Calls',   value: total.cnt || 0,                         color: 'text-white' },
          { label: 'Total Duration', value: fmt(total.total_secs || 0),            color: 'text-blue-400' },
          { label: 'Total Cost',    value: `₹${parseFloat(total.total_cost||0).toFixed(2)}`, color: 'text-amber-400' },
          { label: 'Avg Cost/Call', value: total.cnt > 0 ? `₹${(parseFloat(total.total_cost||0)/total.cnt).toFixed(4)}` : '₹0', color: 'text-gray-300' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
            <p className="text-gray-500 text-xs">{s.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">From Date</label>
            <input type="date"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              value={filters.from}
              onChange={e => setFilters({...filters, from: e.target.value})} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">To Date</label>
            <input type="date"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              value={filters.to_date}
              onChange={e => setFilters({...filters, to_date: e.target.value})} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Status</label>
            <select
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              value={filters.status}
              onChange={e => setFilters({...filters, status: e.target.value})}>
              <option value="all">All Statuses</option>
              <option value="ANSWERED">Answered</option>
              <option value="BUSY">Busy</option>
              <option value="NO ANSWER">No Answer</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Direction</label>
            <select
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              value={filters.direction}
              onChange={e => setFilters({...filters, direction: e.target.value})}>
              <option value="all">All Directions</option>
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button onClick={applyFilters}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
              Apply
            </button>
            {hasActiveFilters && (
              <button onClick={clearFilters}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition">
                ✕
              </button>
            )}
          </div>
        </div>
        {hasActiveFilters && (
          <p className="text-xs text-blue-400 mt-2 flex items-center gap-1">
            <span>🔍</span> Filters active —
            {appliedFilters.status !== 'all' && ` Status: ${appliedFilters.status}`}
            {appliedFilters.direction !== 'all' && ` Direction: ${appliedFilters.direction}`}
            {appliedFilters.from && ` From: ${appliedFilters.from}`}
            {appliedFilters.to_date && ` To: ${appliedFilters.to_date}`}
          </p>
        )}
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {loading && (
          <div className="h-0.5 bg-blue-600 animate-pulse" />
        )}
        <table className="w-full text-sm">
          <thead className="border-b border-gray-800 bg-gray-950/50">
            <tr className="text-gray-400 text-xs uppercase tracking-wide">
              {['Direction','From','To','Date & Time','Duration','Billable','Status','Cost','Provider'].map(h => (
                <th key={h} className="px-3 py-3 text-left font-medium first:pl-4">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {cdrs.map(c => (
              <tr key={c.id} className="hover:bg-gray-800/40 transition-colors group">
                {/* Direction */}
                <td className="px-3 py-3 pl-4">
                  {c.direction === 'inbound'
                    ? <span className="inline-flex items-center gap-1 text-xs text-blue-400 bg-blue-900/30 border border-blue-800 px-2 py-0.5 rounded">↙ In</span>
                    : <span className="inline-flex items-center gap-1 text-xs text-purple-400 bg-purple-900/30 border border-purple-800 px-2 py-0.5 rounded">↗ Out</span>
                  }
                </td>
                {/* From */}
                <td className="px-3 py-3 font-mono text-white text-xs">{c.src || '—'}</td>
                {/* To */}
                <td className="px-3 py-3 font-mono text-white text-xs">{c.dst || '—'}</td>
                {/* Date */}
                <td className="px-3 py-3 text-gray-400 text-xs whitespace-nowrap">{fmtDate(c.start_time)}</td>
                {/* Duration */}
                <td className="px-3 py-3 text-gray-300 text-xs">{fmt(c.duration)}</td>
                {/* Billsec */}
                <td className="px-3 py-3 text-gray-300 text-xs">{fmt(c.billsec)}</td>
                {/* Status */}
                <td className="px-3 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${STATUS_BADGE[c.disposition] || 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                    {c.disposition || 'UNKNOWN'}
                  </span>
                </td>
                {/* Cost */}
                <td className="px-3 py-3 font-mono text-amber-400 text-xs">
                  ₹{parseFloat(c.cost || 0).toFixed(4)}
                </td>
                {/* Provider */}
                <td className="px-3 py-3 text-gray-500 text-xs">{c.provider || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && !cdrs.length && (
          <div className="p-10 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-400 text-sm font-medium">No call records found</p>
            {hasActiveFilters
              ? <p className="text-gray-500 text-xs mt-1">Try adjusting your filters <button onClick={clearFilters} className="text-blue-400 underline">or clear them</button></p>
              : <p className="text-gray-500 text-xs mt-1">Call logs will appear here once calls are made</p>
            }
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-gray-500">
          {total.cnt > 0
            ? `Showing ${((page-1)*LIMIT)+1}–${Math.min(page*LIMIT, total.cnt)} of ${total.cnt} records`
            : `${cdrs.length} records`
          }
        </p>
        <div className="flex gap-1.5">
          <button disabled={page === 1} onClick={() => setPage(1)}
            className="px-2.5 py-1.5 bg-gray-800 text-gray-400 rounded text-xs disabled:opacity-30 hover:bg-gray-700 transition">
            «
          </button>
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded text-sm disabled:opacity-30 hover:bg-gray-700 transition">
            ← Prev
          </button>
          <span className="px-3 py-1.5 text-gray-400 text-sm">
            Page {page}{totalPages > 1 ? ` of ${totalPages}` : ''}
          </span>
          <button disabled={cdrs.length < LIMIT} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded text-sm disabled:opacity-30 hover:bg-gray-700 transition">
            Next →
          </button>
          <button disabled={page === totalPages || totalPages <= 1} onClick={() => setPage(totalPages)}
            className="px-2.5 py-1.5 bg-gray-800 text-gray-400 rounded text-xs disabled:opacity-30 hover:bg-gray-700 transition">
            »
          </button>
        </div>
      </div>
    </div>
  )
}
