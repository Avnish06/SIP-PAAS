# SIPaaS Test Guide PDF Generator (API-Based, No Softphone)

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER

OUTPUT = r"C:\Users\Lenovo\sipaas\SIPaaS_Test_Guide.pdf"


# Palette
C_PAGE_BG    = HexColor('#0d1117')
C_HEADER_BG  = HexColor('#1a1a2e')
C_STEP_BG    = HexColor('#16213e')
C_INFO_BG    = HexColor('#0f3460')
C_SUCCESS_BG = HexColor('#1b4332')
C_WARN_BG    = HexColor('#7b2d00')
C_CODE_BG    = HexColor('#161b22')
C_ACCENT     = HexColor('#e94560')
C_WHITE      = HexColor('#ffffff')
C_LGRAY      = HexColor('#c9d1d9')
C_MGRAY      = HexColor('#8b949e')
C_BORDER     = HexColor('#30363d')
C_STEP_NUM   = HexColor('#58a6ff')
C_ALT_BG     = HexColor('#1c2128')

W, H = A4

def mk_styles():
    return {
        'title': ParagraphStyle('title',
            fontName='Helvetica-Bold', fontSize=26, leading=32,
            textColor=C_WHITE, alignment=TA_CENTER, spaceAfter=4),
        'subtitle': ParagraphStyle('subtitle',
            fontName='Helvetica', fontSize=13, leading=18,
            textColor=C_MGRAY, alignment=TA_CENTER, spaceAfter=6),
        'step_title': ParagraphStyle('step_title',
            fontName='Helvetica-Bold', fontSize=14, leading=18,
            textColor=C_WHITE, spaceAfter=0),
        'step_num': ParagraphStyle('step_num',
            fontName='Helvetica-Bold', fontSize=11, leading=14,
            textColor=C_ACCENT, spaceAfter=2),
        'body': ParagraphStyle('body',
            fontName='Helvetica', fontSize=10, leading=15,
            textColor=C_LGRAY, spaceAfter=6),
        'body_white': ParagraphStyle('body_white',
            fontName='Helvetica', fontSize=10, leading=15,
            textColor=C_WHITE, spaceAfter=4),
        'code': ParagraphStyle('code',
            fontName='Courier', fontSize=8.5, leading=13,
            textColor=HexColor('#79c0ff'), spaceAfter=0),
        'code_comment': ParagraphStyle('code_comment',
            fontName='Courier', fontSize=8.5, leading=13,
            textColor=C_MGRAY, spaceAfter=0),
        'label': ParagraphStyle('label',
            fontName='Helvetica-Bold', fontSize=9, leading=12,
            textColor=C_MGRAY, spaceAfter=2),
        'note': ParagraphStyle('note',
            fontName='Helvetica-Oblique', fontSize=9, leading=13,
            textColor=HexColor('#ffa657'), spaceAfter=4),
        'section': ParagraphStyle('section',
            fontName='Helvetica-Bold', fontSize=16, leading=20,
            textColor=C_ACCENT, spaceBefore=10, spaceAfter=6),
        'toc_item': ParagraphStyle('toc_item',
            fontName='Helvetica', fontSize=10, leading=16,
            textColor=C_LGRAY, leftIndent=10),
        'alt_head': ParagraphStyle('alt_head',
            fontName='Helvetica-Bold', fontSize=12, leading=16,
            textColor=HexColor('#ffa657'), spaceAfter=4),
        'idx_num': ParagraphStyle('idx_num',
            fontName='Helvetica-Bold', fontSize=9,
            textColor=C_STEP_NUM),
        'big': ParagraphStyle('big',
            fontName='Helvetica-Bold', fontSize=52,
            textColor=C_ACCENT, alignment=TA_CENTER),
        'footer_note': ParagraphStyle('footer_note',
            fontName='Helvetica', fontSize=8,
            textColor=C_MGRAY, alignment=TA_CENTER),
        'fc': ParagraphStyle('fc',
            fontName='Helvetica-Bold', fontSize=8,
            textColor=C_WHITE, alignment=TA_CENTER),
        'arrow': ParagraphStyle('arrow',
            fontName='Helvetica-Bold', fontSize=14,
            textColor=C_ACCENT, alignment=TA_CENTER),
        'fc_green': ParagraphStyle('fc_green',
            fontName='Helvetica-Bold', fontSize=8,
            textColor=HexColor('#3fb950'), alignment=TA_CENTER),
        'cheat_label': ParagraphStyle('cheat_label',
            fontName='Helvetica-Bold', fontSize=9, leading=12,
            textColor=C_MGRAY),
    }

S = mk_styles()

def sp(n=6):
    return Spacer(1, n)

def hr(color=C_BORDER, thickness=0.5):
    return HRFlowable(width='100%', thickness=thickness, color=color, spaceAfter=6, spaceBefore=6)

def code_block(lines, label=None):
    rows = []
    if label:
        rows.append([Paragraph(label, S['label'])])
    for ln in lines:
        style = S['code_comment'] if ln.strip().startswith('#') else S['code']
        rows.append([Paragraph(ln if ln else ' ', style)])
    t = Table(rows, colWidths=[155*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_CODE_BG),
        ('LEFTPADDING',  (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('TOPPADDING',   (0,0), (-1,-1), 7),
        ('BOTTOMPADDING',(0,0), (-1,-1), 7),
        ('BOX', (0,0), (-1,-1), 0.5, C_BORDER),
    ]))
    return t

def info_box(lines, bg=None, icon=''):
    if bg is None:
        bg = C_INFO_BG
    paras = []
    for i, ln in enumerate(lines):
        txt = (icon + '  ' + ln) if (icon and i == 0) else ln
        paras.append(Paragraph(txt, S['body_white']))
    t = Table([[paras]], colWidths=[155*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), bg),
        ('LEFTPADDING',  (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ('TOPPADDING',   (0,0), (-1,-1), 8),
        ('BOTTOMPADDING',(0,0), (-1,-1), 8),
        ('BOX', (0,0), (-1,-1), 0.5, C_BORDER),
    ]))
    return t

def step_header(num, title, subtitle=''):
    items = [
        [Paragraph('STEP ' + num, S['step_num'])],
        [Paragraph(title, S['step_title'])],
    ]
    if subtitle:
        items.append([Paragraph(subtitle, S['body'])])
    inner = Table(items, colWidths=[145*mm])
    inner.setStyle(TableStyle([
        ('LEFTPADDING',  (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING',   (0,0), (-1,-1), 1),
        ('BOTTOMPADDING',(0,0), (-1,-1), 1),
    ]))
    t = Table([[inner]], colWidths=[155*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_STEP_BG),
        ('LEFTPADDING',  (0,0), (-1,-1), 14),
        ('RIGHTPADDING', (0,0), (-1,-1), 14),
        ('TOPPADDING',   (0,0), (-1,-1), 10),
        ('BOTTOMPADDING',(0,0), (-1,-1), 10),
        ('LINEBELOW', (0,0), (-1,-1), 2, C_ACCENT),
        ('BOX', (0,0), (-1,-1), 0.5, C_BORDER),
    ]))
    return t

def expected_box(lines):
    rows = [[Paragraph('EXPECTED OUTPUT', S['label'])]]
    for ln in lines:
        rows.append([Paragraph(ln if ln else ' ', S['code'])])
    t = Table(rows, colWidths=[155*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,0), HexColor('#1c3a1c')),
        ('BACKGROUND', (0,1), (-1,-1), C_SUCCESS_BG),
        ('LEFTPADDING',  (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('TOPPADDING',   (0,0), (-1,-1), 6),
        ('BOTTOMPADDING',(0,0), (-1,-1), 6),
        ('BOX', (0,0), (-1,-1), 0.5, HexColor('#2ea043')),
    ]))
    return t

def trouble_table(rows_data):
    header = [
        Paragraph('PROBLEM', S['label']),
        Paragraph('CAUSE', S['label']),
        Paragraph('FIX', S['label']),
    ]
    rows = [header]
    for prob, cause, fix in rows_data:
        rows.append([
            Paragraph(prob, S['body']),
            Paragraph(cause, S['body']),
            Paragraph(fix, S['body']),
        ])
    t = Table(rows, colWidths=[50*mm, 52*mm, 53*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), C_STEP_BG),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [C_ALT_BG, C_CODE_BG]),
        ('GRID', (0,0), (-1,-1), 0.3, C_BORDER),
        ('LEFTPADDING',  (0,0), (-1,-1), 7),
        ('RIGHTPADDING', (0,0), (-1,-1), 7),
        ('TOPPADDING',   (0,0), (-1,-1), 5),
        ('BOTTOMPADDING',(0,0), (-1,-1), 5),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0,0), (-1,-1), C_WHITE),
        ('FONTSIZE', (0,0), (-1,-1), 9),
    ]))
    return t

def page_bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(C_PAGE_BG)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)
    canvas.setFillColor(C_ACCENT)
    canvas.rect(0, H - 3, W, 3, fill=1, stroke=0)
    canvas.setFillColor(C_MGRAY)
    canvas.setFont('Helvetica', 8)
    canvas.drawString(20*mm, 10*mm, 'SIPaaS Test Guide -- API-Based, No Softphone')
    canvas.drawRightString(W - 20*mm, 10*mm, 'Page ' + str(doc.page))
    canvas.restoreState()

def build():
    doc = SimpleDocTemplate(
        OUTPUT, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=18*mm, bottomMargin=20*mm,
    )
    story = []

    # COVER
    story.append(sp(20))
    cover = Table([[Paragraph('SIPaaS', S['big'])]], colWidths=[155*mm])
    cover.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_HEADER_BG),
        ('TOPPADDING',   (0,0), (-1,-1), 22),
        ('BOTTOMPADDING',(0,0), (-1,-1), 22),
        ('BOX', (0,0), (-1,-1), 1, C_ACCENT),
    ]))
    story.append(cover)
    story.append(sp(10))
    story.append(Paragraph('Complete Test Guide', S['title']))
    story.append(Paragraph('API-Based -- No Softphone Required', S['subtitle']))
    story.append(Paragraph('From laptop restart to live call -- using only curl + Docker', S['subtitle']))
    story.append(sp(8))
    story.append(hr(C_ACCENT, 1))
    story.append(sp(4))

    meta = Table([[
        Paragraph('Platform: SIPaaS', S['body']),
        Paragraph('Carrier: Vocallabs (160.30.71.89:3300)', S['body']),
        Paragraph('Prefix: 45454', S['body']),
    ]], colWidths=[51*mm, 72*mm, 32*mm])
    meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_STEP_BG),
        ('LEFTPADDING',  (0,0), (-1,-1), 10),
        ('TOPPADDING',   (0,0), (-1,-1), 7),
        ('BOTTOMPADDING',(0,0), (-1,-1), 7),
        ('BOX', (0,0), (-1,-1), 0.5, C_BORDER),
        ('LINEBEFORE', (1,0), (2,-1), 0.5, C_BORDER),
        ('TEXTCOLOR', (0,0), (-1,-1), C_LGRAY),
    ]))
    story.append(meta)
    story.append(sp(12))

    story.append(Paragraph('What This Guide Covers', S['section']))
    story.append(Paragraph(
        'This guide walks you through testing the SIPaaS platform entirely using '
        'REST API calls and Docker CLI commands. No SIP softphone is needed. '
        'You can trigger real outbound PSTN calls directly via the API.',
        S['body']))
    story.append(sp(4))

    steps_index = [
        ('STEP 0', 'Start Docker Desktop'),
        ('STEP 1', 'Open PowerShell and navigate to project'),
        ('STEP 2', 'Start all containers'),
        ('STEP 3', 'Verify all containers are running'),
        ('STEP 4', 'Check Vocallabs SIP registration'),
        ('STEP 5', 'Register a test account via API'),
        ('STEP 6', 'Login and get JWT token'),
        ('STEP 7', 'Top up account balance'),
        ('STEP 8', 'Create a SIP trunk'),
        ('STEP 9', 'Make a test call via API  &lt;-- THE MAIN TEST'),
        ('STEP 10', 'Check active channels'),
        ('STEP 11', 'Watch live SIP trace'),
        ('STEP 12', 'Check CDR (call detail records)'),
        ('ALT A', 'Direct Asterisk CLI call (bypass API)'),
        ('ALT B', 'Direct ARI call (bypass API layer)'),
        ('', 'Troubleshooting table'),
        ('', 'Handy commands cheat sheet'),
    ]
    for num, title in steps_index:
        row = Table([[
            Paragraph(num, S['idx_num']),
            Paragraph(title, S['toc_item']),
        ]], colWidths=[20*mm, 135*mm])
        row.setStyle(TableStyle([
            ('LEFTPADDING',  (0,0), (-1,-1), 6),
            ('TOPPADDING',   (0,0), (-1,-1), 2),
            ('BOTTOMPADDING',(0,0), (-1,-1), 2),
        ]))
        story.append(row)

    story.append(sp(10))
    story.append(info_box([
        'API BASE URL : http://localhost:3000',
        'ARI URL      : http://localhost:8088',
        'PORTAL URL   : http://localhost:8080',
    ], bg=C_INFO_BG, icon='>>'))
    story.append(PageBreak())

    # STEP 0
    story.append(step_header('0', 'Start Docker Desktop', 'Must be running before any containers can start'))
    story.append(sp(8))
    story.append(Paragraph('1. Open Docker Desktop from the Start menu or taskbar icon.', S['body']))
    story.append(Paragraph('2. Wait until the whale icon in the system tray turns solid (not animated).', S['body']))
    story.append(Paragraph('3. The Docker Desktop window should show: "Docker Desktop is running"', S['body']))
    story.append(sp(4))
    story.append(info_box([
        'If Docker Desktop is slow to start, give it 60-90 seconds.',
        'WSL2 backend must be enabled: Settings > General > Use WSL2 based engine.',
    ], bg=C_INFO_BG))
    story.append(sp(12))

    # STEP 1
    story.append(step_header('1', 'Open PowerShell and Navigate', 'All commands run from the sipaas project directory'))
    story.append(sp(8))
    story.append(Paragraph('Open Windows PowerShell (or Windows Terminal) and run:', S['body']))
    story.append(sp(4))
    story.append(code_block(['cd C:\\Users\\Lenovo\\sipaas'], label='COMMAND'))
    story.append(sp(4))
    story.append(expected_box(['PS C:\\Users\\Lenovo\\sipaas>']))
    story.append(sp(12))

    # STEP 2
    story.append(step_header('2', 'Start All Containers', 'Brings up the full SIPaaS stack'))
    story.append(sp(8))
    story.append(code_block(['docker compose --profile sip up -d'], label='COMMAND'))
    story.append(sp(6))
    story.append(info_box([
        'Wait about 30 seconds after this command. MySQL needs time to initialize.',
        'First run may take longer as Docker pulls base images.',
    ], bg=C_WARN_BG))
    story.append(sp(6))
    story.append(expected_box([
        'Container sipaas-db        Started',
        'Container sipaas-redis     Started',
        'Container asterisk         Started',
        'Container kamailio         Started',
        'Container rtpengine        Started',
        'Container sipaas-api       Started',
        'Container sipaas-portal    Started',
        'Container sipaas-billing   Started',
    ]))
    story.append(sp(12))

    # STEP 3
    story.append(step_header('3', 'Verify All Containers Are Running', 'Check health status of every container'))
    story.append(sp(8))
    story.append(code_block(['docker compose ps'], label='COMMAND'))
    story.append(sp(6))
    story.append(Paragraph(
        'All containers should show "Up" or "healthy". '
        'If any show "Exit" or "Restarting", check their logs:', S['body']))
    story.append(sp(4))
    story.append(code_block([
        'docker logs <container-name> --tail=30',
        '# Examples:',
        'docker logs sipaas-api --tail=30',
        'docker logs asterisk --tail=30',
        'docker logs kamailio --tail=30',
    ], label='DEBUG COMMANDS'))
    story.append(sp(12))

    # STEP 4
    story.append(step_header('4', 'Check Vocallabs SIP Registration', 'Verify upstream carrier is connected'))
    story.append(sp(8))
    story.append(code_block([
        'docker exec asterisk asterisk -rx "pjsip show registrations"',
    ], label='COMMAND'))
    story.append(sp(6))
    story.append(expected_box([
        '<Registration/ServerURI>                           <Auth>          <Status>',
        '==========================================================================',
        'vocallabs-registration/sip:160.30.71.89:3300      vocallabs-auth  Registered',
    ]))
    story.append(sp(6))
    story.append(info_box([
        'If status shows "Rejected" or "Failed":',
        '  - Check your internet connection',
        '  - Verify VOCALLABS_PASS in .env file',
        '  - Try: docker compose restart asterisk  then wait 10 seconds',
    ], bg=C_WARN_BG))
    story.append(sp(12))
    story.append(PageBreak())

    # STEP 5
    story.append(step_header('5', 'Register a Test Account via API', 'Create your customer account -- no UI needed'))
    story.append(sp(8))
    story.append(Paragraph('The REST API is running at http://localhost:3000', S['body']))
    story.append(sp(4))
    story.append(code_block([
        'curl -s -X POST http://localhost:3000/v1/auth/register ^',
        '  -H "Content-Type: application/json" ^',
        '  -d "{\\"email\\":\\"test@sipaas.local\\",' +
            '\\"password\\":\\"Test@1234\\",' +
            '\\"name\\":\\"Test User\\"}" ^',
        '  | python -m json.tool',
    ], label='COMMAND (use ^ for line continuation in Windows PowerShell)'))
    story.append(sp(6))
    story.append(expected_box([
        '{',
        '    "id": 1,',
        '    "email": "test@sipaas.local",',
        '    "name": "Test User",',
        '    "api_key": "abc123def456...",',
        '    "api_secret": "xyz789..."',
        '}',
    ]))
    story.append(sp(6))
    story.append(info_box([
        'If you get 409 Conflict: email already registered. Skip to Step 6 and just login.',
        'The api_key and api_secret can be used for programmatic API access.',
    ], bg=C_INFO_BG))
    story.append(sp(12))

    # STEP 6
    story.append(step_header('6', 'Login and Get JWT Token', 'Required for all subsequent API calls'))
    story.append(sp(8))
    story.append(code_block([
        'curl -s -X POST http://localhost:3000/v1/auth/login ^',
        '  -H "Content-Type: application/json" ^',
        '  -d "{\\"email\\":\\"test@sipaas.local\\",\\"password\\":\\"Test@1234\\"}" ^',
        '  | python -m json.tool',
    ], label='COMMAND'))
    story.append(sp(6))
    story.append(expected_box([
        '{',
        '    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImlhdCI6...",',
        '    "customer": {',
        '        "id": 1,',
        '        "email": "test@sipaas.local",',
        '        "balance": "0.0000"',
        '    }',
        '}',
    ]))
    story.append(sp(6))
    story.append(info_box([
        'IMPORTANT: Copy the token value. Save it as a PowerShell variable:',
        '',
        '  $TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."',
        '',
        'Every API call from here uses: -H "Authorization: Bearer $TOKEN"',
        'Token expires in 24 hours -- re-login if you get 401 errors.',
    ], bg=C_SUCCESS_BG))
    story.append(sp(12))

    # STEP 7
    story.append(step_header('7', 'Top Up Account Balance', 'Kamailio rejects calls with 402 if balance is zero'))
    story.append(sp(8))
    story.append(code_block([
        'curl -s -X POST http://localhost:3000/v1/billing/topup ^',
        '  -H "Content-Type: application/json" ^',
        '  -H "Authorization: Bearer $TOKEN" ^',
        '  -d "{\\"amount\\":100,\\"payment_ref\\":\\"test-topup-001\\"}" ^',
        '  | python -m json.tool',
    ], label='COMMAND'))
    story.append(sp(6))
    story.append(expected_box([
        '{',
        '    "balance": 100,',
        '    "currency": "INR"',
        '}',
    ]))
    story.append(sp(6))
    story.append(Paragraph(
        'Balance is stored in MySQL and synced to Redis. '
        'Kamailio reads from Redis key: sipaas:balance:{customer_id}', S['note']))
    story.append(sp(12))
    story.append(PageBreak())

    # STEP 8
    story.append(step_header('8', 'Create a SIP Trunk', 'A trunk = a SIP identity for making calls'))
    story.append(sp(8))
    story.append(code_block([
        'curl -s -X POST http://localhost:3000/v1/trunks ^',
        '  -H "Content-Type: application/json" ^',
        '  -H "Authorization: Bearer $TOKEN" ^',
        '  -d "{\\"name\\":\\"My Test Trunk\\",\\"max_channels\\":2}" ^',
        '  | python -m json.tool',
    ], label='COMMAND'))
    story.append(sp(6))
    story.append(expected_box([
        '{',
        '    "id": 1,',
        '    "sip_username": "c1_1748534921543",',
        '    "sip_password": "a1b2c3d4e5f67890abcdef...",',
        '    "sip_domain": "49.39.175.29",',
        '    "sip_server": "49.39.175.29",',
        '    "sip_port": 5060,',
        '    "auth_type": "digest",',
        '    "max_channels": 2',
        '}',
    ]))
    story.append(sp(6))
    story.append(info_box([
        'SAVE the "id" field -- this is your trunk_id for Step 9.',
        'The trunk is now provisioned in Kamailio subscriber table.',
        'max_channels: 2 means this trunk allows 2 simultaneous calls.',
    ], bg=C_SUCCESS_BG))
    story.append(sp(12))

    # STEP 9 - THE MAIN TEST
    story.append(KeepTogether([
        step_header('9', 'Make a Test Call via API', 'THE MAIN TEST -- triggers real outbound PSTN call'),
        sp(8),
    ]))

    # Call flow diagram
    flow_data = [[
        Paragraph('Your\nAPI Call', S['fc']),
        Paragraph('-->', S['arrow']),
        Paragraph('Asterisk\nARI', S['fc']),
        Paragraph('-->', S['arrow']),
        Paragraph('Outbound\nDialplan', S['fc']),
        Paragraph('-->', S['arrow']),
        Paragraph('Vocallabs\n160.30.71.89', S['fc']),
        Paragraph('-->', S['arrow']),
        Paragraph('PSTN\n(Phone rings)', S['fc_green']),
    ]]
    flow_t = Table(flow_data, colWidths=[19*mm, 9*mm, 19*mm, 9*mm, 22*mm, 9*mm, 27*mm, 9*mm, 22*mm])
    flow_t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,-1), C_INFO_BG),
        ('BACKGROUND', (2,0), (2,-1), C_INFO_BG),
        ('BACKGROUND', (4,0), (4,-1), C_INFO_BG),
        ('BACKGROUND', (6,0), (6,-1), C_STEP_BG),
        ('BACKGROUND', (8,0), (8,-1), HexColor('#1b4332')),
        ('BACKGROUND', (1,0), (1,-1), C_PAGE_BG),
        ('BACKGROUND', (3,0), (3,-1), C_PAGE_BG),
        ('BACKGROUND', (5,0), (5,-1), C_PAGE_BG),
        ('BACKGROUND', (7,0), (7,-1), C_PAGE_BG),
        ('TOPPADDING',   (0,0), (-1,-1), 8),
        ('BOTTOMPADDING',(0,0), (-1,-1), 8),
        ('LEFTPADDING',  (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOX', (0,0), (0,-1), 0.5, C_BORDER),
        ('BOX', (2,0), (2,-1), 0.5, C_BORDER),
        ('BOX', (4,0), (4,-1), 0.5, C_BORDER),
        ('BOX', (6,0), (6,-1), 0.5, C_BORDER),
        ('BOX', (8,0), (8,-1), 0.5, HexColor('#2ea043')),
    ]))
    story.append(flow_t)
    story.append(sp(8))

    story.append(code_block([
        'curl -s -X POST http://localhost:3000/v1/calls/originate ^',
        '  -H "Content-Type: application/json" ^',
        '  -H "Authorization: Bearer $TOKEN" ^',
        '  -d "{\\"from\\":\\"919228130351\\",' +
            '\\"to\\":\\"+919142436879\\",' +
            '\\"trunk_id\\":1}" ^',
        '  | python -m json.tool',
        '',
        '# Replace +919142436879 with the actual destination number',
        '# Replace trunk_id:1 with the id from Step 8',
    ], label='COMMAND'))
    story.append(sp(6))
    story.append(expected_box([
        '{',
        '    "call_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",',
        '    "status": "originating",',
        '    "from": "sip:919228130351@49.39.175.29",',
        '    "to": "sip:+919142436879@49.39.175.29"',
        '}',
    ]))
    story.append(sp(6))
    story.append(info_box([
        'What happens internally when you hit this API:',
        '  1. API validates token, checks balance > 0, verifies trunk ownership',
        '  2. API calls Asterisk ARI: POST http://localhost:8088/ari/channels',
        '  3. Asterisk dialplan strips + from +919142436879 -> 919142436879',
        '  4. Dialplan prepends prefix 45454 -> sends 45454919142436879 to Vocallabs',
        '  5. Vocallabs receives INVITE at 160.30.71.89:3300 and routes to PSTN',
        '  6. If Vocallabs PSTN routing is active, the destination phone rings',
    ], bg=C_INFO_BG))
    story.append(sp(12))
    story.append(PageBreak())

    # STEP 10
    story.append(step_header('10', 'Check Active Channels', 'Verify the call is live and in progress'))
    story.append(sp(8))
    story.append(Paragraph('Check via the API:', S['body']))
    story.append(code_block([
        'curl -s http://localhost:3000/v1/calls/active ^',
        '  -H "Authorization: Bearer $TOKEN" ^',
        '  | python -m json.tool',
    ], label='API COMMAND'))
    story.append(sp(4))
    story.append(expected_box(['{ "active_channels": 1 }']))
    story.append(sp(8))
    story.append(Paragraph('Or check Asterisk directly:', S['body']))
    story.append(code_block([
        'docker exec asterisk asterisk -rx "core show channels"',
    ], label='ASTERISK CLI'))
    story.append(sp(4))
    story.append(expected_box([
        'Channel                     Location           State  Application(Data)',
        'PJSIP/vocallabs-trunk-00000 +919142436879@...  Up     Dial()',
        '1 active channel',
        '1 active call',
    ]))
    story.append(sp(12))

    # STEP 11
    story.append(step_header('11', 'Watch Live SIP Trace', 'See the full SIP signaling in real time'))
    story.append(sp(8))
    story.append(Paragraph('Open a SECOND PowerShell window and run:', S['body']))
    story.append(sp(4))
    story.append(code_block([
        '# Enable SIP packet logging',
        'docker exec asterisk asterisk -rx "pjsip set logger on"',
        '',
        '# Stream live Asterisk logs',
        'docker logs asterisk -f',
    ], label='IN A SECOND POWERSHELL WINDOW'))
    story.append(sp(6))
    story.append(expected_box([
        '-- Called +919142436879@outbound',
        '-- Executing [+919142436879@outbound:3] Set DNIS=45454919142436879',
        '-- Sending DNIS: 45454919142436879 via PJSIP/vocallabs-trunk',
        '-- Called PJSIP/45454919142436879@vocallabs-trunk',
        '-- PJSIP/vocallabs-trunk-00000000 answered',
        '-- Channel PJSIP/vocallabs-trunk joined simple_bridge',
    ]))
    story.append(sp(6))
    story.append(info_box([
        'Number format breakdown:',
        '  Input to API  :  +919142436879',
        '  After strip + :   919142436879',
        '  After prefix  : 45454919142436879  <-- this is what Vocallabs receives',
        '  Caller ID shown: 919228130352 (Vocallabs CLI shown to destination)',
    ], bg=C_INFO_BG))
    story.append(sp(12))

    # STEP 12
    story.append(step_header('12', 'Check CDR -- Call Detail Records', 'Verify billing and call history'))
    story.append(sp(8))
    story.append(code_block([
        'curl -s "http://localhost:3000/v1/calls/cdr?limit=5" ^',
        '  -H "Authorization: Bearer $TOKEN" ^',
        '  | python -m json.tool',
    ], label='COMMAND'))
    story.append(sp(6))
    story.append(expected_box([
        '{',
        '    "cdrs": [',
        '        {',
        '            "id": 1,',
        '            "src": "919228130351",',
        '            "dst": "919142436879",',
        '            "start_time": "2026-05-12T10:00:00.000Z",',
        '            "disposition": "ANSWERED",',
        '            "duration": 30,',
        '            "billsec": 28,',
        '            "cost": "0.2100",',
        '            "rate": "0.45"',
        '        }',
        '    ]',
        '}',
    ]))
    story.append(sp(6))
    story.append(Paragraph(
        'cost = billsec/60 * rate_per_min = 28/60 * 0.45 = 0.21 INR', S['note']))
    story.append(sp(12))
    story.append(PageBreak())

    # ALTERNATIVES
    story.append(Paragraph('Alternative Methods', S['section']))
    story.append(sp(6))

    story.append(Paragraph('ALT A -- Direct Asterisk CLI Call (bypasses API + Kamailio)', S['alt_head']))
    story.append(Paragraph(
        'Quick testing without auth, balance check, or CDR writing:', S['body']))
    story.append(sp(4))
    story.append(code_block([
        'docker exec asterisk asterisk -rx ^',
        '  "channel originate Local/+919142436879@outbound application Wait 30"',
        '',
        '# Then watch the result:',
        'docker logs asterisk --tail=20',
    ], label='ASTERISK CLI'))
    story.append(sp(10))

    story.append(Paragraph('ALT B -- Direct ARI Call (bypasses API layer only)', S['alt_head']))
    story.append(Paragraph(
        'Calls Asterisk ARI directly -- skips the Node.js API but goes through dialplan and Vocallabs:', S['body']))
    story.append(sp(4))
    story.append(code_block([
        'curl -s -X POST "http://localhost:8088/ari/channels" ^',
        '  -u "ariuser:AriPassword!" ^',
        '  -H "Content-Type: application/json" ^',
        '  -d "{\\"endpoint\\":\\"PJSIP/45454919142436879@vocallabs-trunk\\",' +
            '\\"callerId\\":\\"919228130352\\",' +
            '\\"timeout\\":30,' +
            '\\"context\\":\\"from-ari\\",' +
            '\\"extension\\":\\"+919142436879\\",' +
            '\\"priority\\":1}" ^',
        '  | python -m json.tool',
    ], label='DIRECT ARI COMMAND'))
    story.append(sp(6))
    story.append(info_box([
        'ARI credentials: ARI_USER=ariuser / ARI_PASS=AriPassword! (set in .env)',
        'Note: the 45454 prefix is already included in the endpoint string above.',
    ], bg=C_INFO_BG))
    story.append(sp(12))
    story.append(PageBreak())

    # TROUBLESHOOTING
    story.append(Paragraph('Troubleshooting', S['section']))
    story.append(sp(6))
    story.append(trouble_table([
        ('API returns 401 Unauthorized',
         'Wrong or expired JWT token',
         'Re-run Step 6 login, copy new token into $TOKEN'),
        ('API returns 402 Payment Required',
         'Account balance is zero',
         'Run Step 7 topup: POST /v1/billing/topup'),
        ('API returns 403 Forbidden',
         'trunk_id does not belong to your account',
         'Run GET /v1/trunks to list your trunks, use correct id'),
        ('API returns 503 Service Unavailable',
         'Max concurrent channels reached for trunk',
         'Increase via: PATCH /v1/trunks/:id with max_channels'),
        ('Call drops in under 1 second',
         'Vocallabs 200 OK + immediate BYE',
         'Outbound PSTN not activated on Vocallabs account -- fix server side'),
        ('sipaas-api container exits',
         'DB or Redis not ready yet',
         'Wait 30s, run: docker compose up -d again'),
        ('pjsip show: Registration Failed',
         'Wrong Vocallabs credentials or account suspended',
         'Check VOCALLABS_PASS in .env, verify on Vocallabs portal'),
        ('200 OK then immediate BYE',
         'Vocallabs cannot reach your RTP/media IP',
         'Open ports 10000-20000 UDP on firewall/router'),
        ('API cannot reach Asterisk ARI',
         'ASTERISK_ARI_URL misconfigured',
         'Check docker-compose.yml ASTERISK_ARI_URL env var'),
        ('Kamailio exits with uacreg error',
         'DB schema version mismatch (expected v5, got v2)',
         'Run the ALTER TABLE migration for uacreg table'),
    ]))
    story.append(sp(12))
    story.append(PageBreak())

    # CHEAT SHEET
    story.append(Paragraph('Handy Commands Cheat Sheet', S['section']))
    story.append(sp(6))

    cheat_sections = [
        ('Container Management', [
            'docker compose ps                              # status of all containers',
            'docker compose --profile sip up -d            # start all SIP containers',
            'docker compose restart asterisk               # restart single container',
            'docker compose logs -f --tail=20              # tail all logs together',
            'docker logs asterisk --tail=50                # asterisk logs only',
        ]),
        ('Asterisk CLI', [
            'docker exec -it asterisk asterisk -rvvv',
            'docker exec asterisk asterisk -rx "pjsip show registrations"',
            'docker exec asterisk asterisk -rx "core show channels"',
            'docker exec asterisk asterisk -rx "pjsip set logger on"',
            'docker exec asterisk asterisk -rx "dialplan reload"',
            'docker exec asterisk asterisk -rx "module reload res_pjsip.so"',
        ]),
        ('API Quick Tests', [
            '# Check balance',
            'curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/v1/billing/balance',
            '# List trunks',
            'curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/v1/trunks',
            '# Call history',
            'curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/v1/calls/cdr?limit=10"',
            '# Active channels',
            'curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/v1/calls/active',
        ]),
        ('Redis and MySQL', [
            '# Check customer balance in Redis (replace 1 with customer id)',
            'docker exec sipaas-redis redis-cli -a RedisPass789! get sipaas:balance:1',
            '# Check active channel count',
            'docker exec sipaas-redis redis-cli -a RedisPass789! get sipaas:channels:1',
            '# MySQL quick query',
            'docker exec sipaas-db mysql -u sipaas -pStrongDBPassword123! kamailio ^',
            '  -e "SELECT id,name,sip_username,status FROM trunks LIMIT 5;"',
        ]),
        ('Kamailio', [
            'docker exec kamailio kamctl dispatcher show   # show Asterisk targets',
            'docker exec kamailio kamctl ul show           # show registered SIP users',
            'docker logs kamailio --tail=30                # Kamailio logs',
        ]),
    ]

    for section_title, cmds in cheat_sections:
        story.append(Paragraph(section_title, S['alt_head']))
        story.append(code_block(cmds))
        story.append(sp(8))

    # CURRENT STATUS
    story.append(sp(4))
    story.append(Paragraph('Current System Status', S['section']))
    story.append(sp(4))

    status_rows = [
        ['Component', 'Status', 'Notes'],
        ['Stack / Containers', 'WORKING', 'All containers start and remain stable'],
        ['Kamailio', 'WORKING', 'uacreg schema fixed, dispatcher active'],
        ['Asterisk', 'WORKING', 'PJSIP registered, ARI on 8088, AMI on 5038'],
        ['Vocallabs Registration', 'REGISTERED', '160.30.71.89:3300 -- account 1769066634611'],
        ['SDP / RTP IP', 'CORRECT', 'Advertises 49.39.175.29 (laptop public IP)'],
        ['Outbound Prefix', 'CORRECT', '45454 prepended -- sends 45454919XXXXXXXXXX'],
        ['PSTN Routing', 'PENDING', 'Vocallabs sends 200 OK + immediate BYE'],
        ['Fix Required', 'Vocallabs side', 'Activate outbound PSTN on account 1769066634611'],
    ]

    st = Table(status_rows, colWidths=[45*mm, 35*mm, 75*mm])
    st.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), C_STEP_BG),
        ('BACKGROUND', (0,1), (-1,6), C_SUCCESS_BG),
        ('BACKGROUND', (0,7), (-1,8), C_WARN_BG),
        ('GRID', (0,0), (-1,-1), 0.3, C_BORDER),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('TEXTCOLOR', (0,0), (-1,-1), C_WHITE),
        ('LEFTPADDING',  (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING',   (0,0), (-1,-1), 5),
        ('BOTTOMPADDING',(0,0), (-1,-1), 5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(st)

    story.append(sp(12))
    story.append(hr(C_ACCENT, 1))
    story.append(sp(4))
    story.append(Paragraph(
        'SIPaaS Test Guide -- Generated 2026-05-12 -- Vocallabs upstream (160.30.71.89:3300)',
        S['footer_note']))

    doc.build(story, onFirstPage=page_bg, onLaterPages=page_bg)
    print('PDF written to: ' + OUTPUT)

if __name__ == '__main__':
    build()
