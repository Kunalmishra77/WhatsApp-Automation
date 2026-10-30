// Builds the AGENTiX sales playbook as a .docx.
// Run: node docs/sales/build-pitch.js
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  LevelFormat, PageBreak,
} = require('docx');
const fs = require('fs');
const path = require('path');

const BRAND = '1F6F4A';
const DARK = '1A1A1A';
const MUTED = '5A5A5A';
const W = 9020; // usable width in DXA for A4 with 1" margins

const P = (text, opts = {}) => new Paragraph({
  spacing: { after: opts.after ?? 120, line: 276 },
  alignment: opts.align,
  children: [new TextRun({ text, size: opts.size ?? 21, color: opts.color ?? DARK, bold: opts.bold, italics: opts.italics })],
});

const Rich = (runs, opts = {}) => new Paragraph({
  spacing: { after: opts.after ?? 120, line: 276 },
  children: runs.map((r) => new TextRun({ size: 21, color: DARK, ...r })),
});

const H1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 320, after: 160 },
  children: [new TextRun({ text, size: 30, bold: true, color: BRAND })],
});

const H2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 240, after: 120 },
  children: [new TextRun({ text, size: 24, bold: true, color: DARK })],
});

const Bullet = (text, level = 0) => new Paragraph({
  numbering: { reference: 'dots', level },
  spacing: { after: 80, line: 276 },
  children: [new TextRun({ text, size: 21, color: DARK })],
});

const Script = (text) => new Paragraph({
  spacing: { after: 120, line: 276 },
  indent: { left: 360 },
  border: { left: { style: BorderStyle.SINGLE, size: 12, color: BRAND, space: 12 } },
  children: [new TextRun({ text, size: 21, italics: true, color: DARK })],
});

const Rule = () => new Paragraph({
  spacing: { before: 120, after: 160 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'DDDDDD', space: 1 } },
  children: [],
});

function table(headers, rows, widths) {
  const cell = (text, { bold, shade, width, color } = {}) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: shade ? { type: ShadingType.CLEAR, fill: shade, color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      spacing: { after: 0, line: 260 },
      children: [new TextRun({ text, size: 19, bold, color: color ?? DARK })],
    })],
  });
  return new Table({
    columnWidths: widths,
    width: { size: W, type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => cell(h, { bold: true, shade: 'EFF5F1', width: widths[i] })),
      }),
      ...rows.map((r) => new TableRow({
        children: r.map((c, i) => cell(c, { width: widths[i] })),
      })),
    ],
  });
}

const doc = new Document({
  creator: 'AGENTiX',
  title: 'AGENTiX Sales Playbook',
  description: 'Sales team ke liye: product kaise bechna hai, requirement ke hisaab se',
  numbering: {
    config: [{
      reference: 'dots',
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 180 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 180 } } } },
      ],
    }],
  },
  styles: {
    default: { document: { run: { font: 'Calibri', size: 21 } } },
  },
  sections: [{
    properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    children: [
      // ── Cover ──────────────────────────────────────────────────────────
      new Paragraph({ spacing: { before: 1200, after: 0 }, children: [
        new TextRun({ text: 'AGENTiX', size: 56, bold: true, color: BRAND }),
      ]}),
      new Paragraph({ spacing: { after: 400 }, children: [
        new TextRun({ text: 'Sales Playbook — WhatsApp & Instagram Automation', size: 28, color: DARK }),
      ]}),
      P('Ye document sales team ke liye hai. Isme likha hai ki customer ki zarurat sun kar kya bechna hai, kaise bechna hai, kis rate par, aur kya cheez bilkul nahi bolni.', { color: MUTED }),
      P('Padhne ka tareeka: Section 4 (Requirement se Pitch) aapka roz ka kaam hai. Section 6 (Rate Card) yaad rakhiye. Section 10 (Kya NAHI bolna) sabse zaroori hai — wahi aapko refund aur jhagde se bachayega.', { color: MUTED }),
      new Paragraph({ spacing: { before: 400 }, children: [new TextRun({
        text: 'Aakhri update: 30 October 2026', size: 19, color: MUTED, italics: true })] }),

      new Paragraph({ children: [new PageBreak()] }),

      // ── 1 ──────────────────────────────────────────────────────────────
      H1('1. Product ek line me'),
      Script('"Aapke WhatsApp par jo customer message karta hai, usse AI 24 ghante jawab deta hai, lead banata hai, aur aapki team ko batata hai kaun kharidne wala hai."'),
      P('Bas itna. Technical baat mat kijiye. Customer ko teen cheezein chahiye hoti hai — zyada leads, jawab dene me kam mehnat, aur ye pata chale ki paisa kahan se aa raha hai. Hamara product teeno deta hai.'),

      H2('Jab customer poochhe "ye chatbot hai kya?"'),
      Script('"Chatbot fixed jawab deta hai. Ye aapke business ko padhta hai — aapke rate, aapke products, aapka time — aur customer ke sawal ka asli jawab deta hai, Hindi me bhi, English me bhi."'),

      Rule(),
      // ── 2 ──────────────────────────────────────────────────────────────
      H1('2. Kis business ko bechna hai'),
      P('Sabse aasan sale wahan hai jahan ye teeno ho:'),
      Bullet('WhatsApp par roz customer message karte hai (10+ din me)'),
      Bullet('Koi ek banda reply karta hai, ya koi nahi karta'),
      Bullet('Business ke paas ek hi cheez bechne ko hai jiska rate fix hai'),
      P('Abhi tak ye industries sabse achhi chali hai:', { after: 80 }),
      table(
        ['Industry', 'Unka asli dard', 'Pehli line'],
        [
          ['Gym / Fitness', 'Ad se lead aati hai, raat ko koi reply nahi karta', 'Raat 11 baje jo enquiry aati hai, uska kya hota hai?'],
          ['Hospital / Clinic', 'Appointment ke liye phone par line lagi rehti hai', 'Appointment WhatsApp par ho jaye to reception ka load kitna ghategaa?'],
          ['Salon / Spa', 'Booking ke liye baar-baar call karna padta hai', 'Booking confirm karne me roz kitna time jata hai?'],
          ['Resort / Hotel', 'Rate aur availability ka wahi sawal baar-baar', 'Din me kitni baar "rate kya hai" ka jawab dete ho?'],
          ['D2C / Jewellery', 'Ad click hota hai, lekin reply late jata hai', 'Ad par paisa laga rahe ho — reply kitni der me jata hai?'],
          ['Real Estate', 'Serious buyer aur time-pass me farak nahi pata', 'Kaun sa lead serious hai, ye kaise pata karte ho?'],
          ['Coaching / School', 'Demo class ki enquiry handle nahi hoti', 'Admission season me kitni enquiry chhoot jaati hai?'],
          ['Software / Services', 'Demo book karne me 4-5 message lagte hai', 'Demo book karne me kitne message lagte hai abhi?'],
        ],
        [1800, 3400, 3820],
      ),

      new Paragraph({ children: [new PageBreak()] }),
      // ── 3 ──────────────────────────────────────────────────────────────
      H1('3. Call ka pehla minute'),
      H2('Opening'),
      Script('"Namaste sir, main AGENTiX se bol raha hu. Ek minute hai? Main ye poochhne aaya hu ki aapke WhatsApp par jo enquiry aati hai, uska reply kaun deta hai — aap khud, ya koi staff?"'),
      P('Yahi se baat shuru hoti hai. Product ka naam mat lijiye, feature mat ginayiye. Unka jawab suniye.'),

      H2('Discovery — ye 6 sawal poochhiye'),
      P('In jawabon se aapko pata chal jayega ki kya bechna hai. Likh lijiye.', { color: MUTED, after: 80 }),
      table(
        ['Sawal', 'Jawab se kya pata chalega'],
        [
          ['Din me kitne customer WhatsApp par message karte hai?', '10 se kam = abhi mat bechiye. 20+ = achha lead.'],
          ['Reply kaun deta hai, aur kitni der me?', 'Der ka number hi aapka sabse bada hathiyaar hai.'],
          ['Raat ko aur Sunday ko message aate hai? Unka kya hota hai?', 'Yahan "chhoot jaate hai" ka jawab aaye to sale pakki hai.'],
          ['Meta ya Google par ad chalate ho?', 'Haan = Meta Leads / Google Leads add-on bechna hai.'],
          ['Instagram par bhi DM aate hai?', 'Haan = Instagram add-on.'],
          ['Google par aapki shop dikhti hai? Review aate hai?', 'Haan = GMB add-on.'],
        ],
        [4200, 4820],
      ),

      Rule(),
      // ── 4 ──────────────────────────────────────────────────────────────
      H1('4. Requirement se Pitch — ye aapka roz ka table hai'),
      P('Customer jo bolta hai, uske saamne wala feature bechiye. Pura product mat ginayiye — jo unka dard hai wahi dikhayiye.', { after: 80 }),
      table(
        ['Customer ye bolta hai', 'Aap ye bechiye', 'Aap ye kahiye'],
        [
          ['"Raat ko reply nahi hota"', 'AI Bot (Core)', 'Bot 24 ghante hai. Subah aapke paas jawab-sameta lead milega.'],
          ['"Same sawal baar-baar poochhte hai"', 'Knowledge Base', 'Aapka rate list, address, timing bot ko ek baar de dijiye — phir wo khud batata hai.'],
          ['"Bot galat rate bata deta hai"', 'Current Offer', 'Offer ki tareekh ke saath dalte hai. Offer khatam, bot apne aap quote karna band.'],
          ['"Mujhe booking leni hai"', 'Flow + Ask & Check', 'Bot naam, din aur time poochhta hai — aur galat jawab accept nahi karta.'],
          ['"Bulk message bhejna hai"', 'Campaigns', 'Photo, video, PDF ke saath hazaro logo ko. Kitno ne padha, ye bhi dikhega.'],
          ['"Lead ka kya hua pata nahi chalta"', 'CRM + AI Score', 'Har lead Hot / Warm / Cold me apne aap bat jaati hai.'],
          ['"Ad par paisa laga rahe hai, result nahi dikhta"', 'Meta Leads', 'Kaun si ad se kaun sa customer aaya, aur usse kitna business hua.'],
          ['"Google par leads aati hai"', 'Google Leads', 'Google ki lead seedhe WhatsApp par, aur CRM me.'],
          ['"Google par review nahi sambhalte"', 'GMB', 'Review ka jawab apne aap, aur Google par aapki rank har hafte.'],
          ['"Instagram par bhi DM aate hai"', 'Instagram', 'Wahi bot Instagram DM par bhi.'],
          ['"Shopify par dukaan hai"', 'Shopify Updates', 'Order confirm, ship aur cancel ka message WhatsApp par apne aap.'],
          ['"Team me 4 log hai"', 'Team Inbox', 'Sabke liye alag login, chat assign, aur kisne kya kiya ka record.'],
          ['"Report chahiye"', 'Analytics + Digest', 'Har hafte email par report — bina kisi ko kholne ki zarurat.'],
        ],
        [2600, 1900, 4520],
      ),

      new Paragraph({ children: [new PageBreak()] }),
      // ── 5 ──────────────────────────────────────────────────────────────
      H1('5. Poore features — A to Z'),
      P('Ye poori list hai. Call me saari mat ginayiye — zarurat ke hisaab se uthayiye. Jo cheez abhi nahi bani, wo Section 10 me alag likhi hai.', { color: MUTED }),

      H2('A. WhatsApp AI Bot — ye Core hai'),
      Bullet('24 ghante jawab, Hindi + English + Hinglish, jis bhasha me customer likhe'),
      Bullet('Aapke business ka apna persona — bot aapki awaaz me baat karta hai'),
      Bullet('Knowledge Base — rate list, PDF, policy upload kijiye, bot wahi se jawab deta hai'),
      Bullet('Voice note sun leta hai aur samajh leta hai'),
      Bullet('Photo dekh kar jawab deta hai (customer ne product ki photo bheji to)'),
      Bullet('Business ke baahar ke sawal par vinamrata se mana karta hai — galat baat nahi karta'),
      Bullet('Gandi ya galat photo par apne aap block karta hai'),
      Bullet('Current Offer — ek hi sahi rate, tareekh ke saath, khatam hone par apne aap band'),

      H2('B. Flows — bina coding ke booking aur process'),
      Bullet('Step-by-step list me banaiye, ya canvas par — dono me wahi flow'),
      Bullet('12 tarah ke step: message, sawal, button/menu, image/PDF, wait, action, template, AI jawab, check wala sawal, aur doosre system ko bhejna'),
      Bullet('"Try it" — bhejne se pehle khud chala kar dekh lijiye, kisi asli number ki zarurat nahi'),
      Bullet('Galti pehle hi pakad li jaati hai — jaise koi sawal jiska jawab kahin save hi nahi hota'),
      Bullet('8 industry ke taiyaar template: gym, clinic, salon, resort, D2C, property, coaching, software'),

      H2('C. Campaigns — bulk message'),
      Bullet('Photo, video, PDF, location, audio — sab bhej sakte hai'),
      Bullet('Carousel aur limited-time offer wale template bhi'),
      Bullet('Tag ya list ke hisaab se audience, ya CSV upload'),
      Bullet('Schedule — abhi ya baad me'),
      Bullet('Kitne pahunche, kitno ne padha, kitno ne reply kiya — sab dikhta hai'),
      Bullet('AI se message likhwa sakte hai'),

      H2('D. Template Management'),
      Bullet('Template banaiye — approval ke liye Meta ko apne aap chala jata hai'),
      Bullet('Approve hua ya reject, aur reject hua to kyun — sab platform par dikhta hai'),

      H2('E. CRM aur Leads'),
      Bullet('Har enquiry apne aap lead banti hai'),
      Bullet('AI score 0–100, aur usi se Hot / Warm / Cold'),
      Bullet('Pipeline — new, contacted, interested, converted, lost'),
      Bullet('Har lead ki poori journey — kaun si ad, kaun sa message, kab'),

      H2('F. Team Inbox'),
      Bullet('Sabke liye alag login aur alag permission'),
      Bullet('Chat kisi staff ko assign kijiye'),
      Bullet('Internal note — customer ko nahi dikhta'),
      Bullet('Label, search, filter'),
      Bullet('Kaun sa staff ne kya kiya — poora record'),
      Bullet('Pareshan karne wale number ko block'),

      H2('G. Automations — jo apne aap chalta hai'),
      Bullet('Business hours — band hone par alag message'),
      Bullet('Chat apne aap kisi staff ko lag jaati hai'),
      Bullet('Purani chat apne aap band'),
      Bullet('Customer se rating apne aap poochhi jaati hai'),
      Bullet('Inbox rules — "ye shabd aaye to ye karo"'),

      H2('H. Reports'),
      Bullet('Kitne message, kitne jawab, kitni der me — sab'),
      Bullet('Campaign ki report'),
      Bullet('Marketing ROI — ad par kitna laga, business kitna aaya'),
      Bullet('Har hafte aur har mahine email par report'),

      new Paragraph({ children: [new PageBreak()] }),
      H2('I. Meta Ads (add-on)'),
      Bullet('Click-to-WhatsApp ad se aaya customer apne aap pehchan liya jata hai'),
      Bullet('Kaun si ad se kaun si lead — ad ke naam ke saath'),
      Bullet('Ad ka kharcha apne aap aata hai, ROI ke saath'),

      H2('J. Google (add-on)'),
      Bullet('Google Business Profile — review ka jawab apne aap'),
      Bullet('Local Rank — aapki shop Google par kaun se shabd par kis number par hai'),
      Bullet('Google Ads ki lead seedhe WhatsApp aur CRM me'),

      H2('K. Instagram (add-on)'),
      Bullet('Wahi AI bot Instagram DM par'),
      Bullet('Lead wahi CRM me aati hai — alag jagah dekhne ki zarurat nahi'),

      H2('L. E-commerce (add-on)'),
      Bullet('Shopify — order confirm, paid, ship aur cancel ka WhatsApp message apne aap'),
      Bullet('Chhoda hua cart — customer cart bhar ke chala gaya, to use WhatsApp par yaad dilana'),
      Bullet('Cart wala kaam Shopify, WooCommerce aur apni khud ki website — teeno par chalta hai'),
      Bullet('Har message ka text aap apne hisaab se likh sakte hai'),

      H2('M. Integrations'),
      Bullet('Google Sheet — har lead ek row me, apne aap'),
      Bullet('Webhook — aapka apna CRM ya koi bhi system jod sakte hai'),

      H2('N. Aur bhi'),
      Bullet('Referral program — customer se customer'),
      Bullet('Jo customer chhodne wala hai, uski pehchan'),
      Bullet('White-label — aapke apne naam aur logo ke saath'),
      Bullet('Mobile par app jaisa — install karne ki zarurat nahi'),

      Rule(),
      // ── 6 ──────────────────────────────────────────────────────────────
      H1('6. Rate Card'),
      P('Sab rate mahine ke hai. GST 18% alag. Lamba plan lene par bachat hai.', { after: 80 }),
      table(
        ['Kya', 'Rate / mahina', 'GST ke saath', 'Kab bechna hai'],
        [
          ['Core — WhatsApp AI', '₹2,999', '₹3,538', 'Har customer ko. Ye base hai.'],
          ['Instagram', '+ ₹999', '₹1,178', 'Instagram par DM aate ho tab'],
          ['Google Growth (GMB + Google Leads)', '+ ₹999', '₹1,178', 'Google par shop ya ads ho tab'],
          ['All-in-One (sab kuchh)', '₹4,999', '₹5,898', 'Sabse achha deal — yahi push kijiye'],
        ],
        [3000, 1700, 1700, 2620],
      ),
      P('All-in-One alag se sab lene se sasta padta hai. Isi ko aage rakhiye.', { bold: true }),

      H2('Lamba plan — bachat'),
      table(
        ['Period', 'Core', 'All-in-One', 'Customer ko kya kahiye'],
        [
          ['1 mahina', '₹2,999', '₹4,999', 'Shuru karne ke liye'],
          ['3 mahine', '₹8,997', '₹14,997', 'Ek mahina free jaisa nahi, par commitment achhi'],
          ['6 mahine', '₹15,000', '₹25,000', 'Ek mahine se zyada ki bachat'],
          ['1 saal', '₹30,000', '₹49,990', 'Do mahine ki bachat — yahi best hai'],
        ],
        [1600, 1700, 1900, 3820],
      ),

      H2('Trial'),
      Bullet('3 din ka free trial — card ki zarurat nahi'),
      Bullet('Trial me limit: 100 AI reply, 1 campaign, 50 logo tak'),
      Bullet('Trial ka maqsad: unko apna hi bot chalte hue dikhana. Setup unke saamne kijiye.'),

      H2('Meta ke apne charges — ye saaf bol dijiye'),
      P('WhatsApp par message bhejne ka charge Meta leta hai, aur wo customer ke apne Meta account se katta hai — hamare rate me shaamil nahi hai. Rakam choti hai: service wale message free hai, utility message lagbhag 6 paise, aur marketing message lagbhag 86 paise. Ye pehle hi bata dijiye — baad me pata chalne par customer ko bura lagta hai.'),

      new Paragraph({ children: [new PageBreak()] }),
      // ── 6B ─────────────────────────────────────────────────────────────
      H1('6B. IndiaMART, JustDial aur custom integration'),
      P('Bahut customers poochhte hai ki "IndiaMART ki lead bhi yahi aa jaye?" ya "JustDial se jo enquiry aati hai wo bhi?" — jawab HAAN hai, lekin ek shart ke saath jo aapko saaf bolni hai.'),
      Rich([
        { text: 'Ye ready feature nahi hai. ', bold: true },
        { text: 'Hum aapke liye banakar denge. Isliye iska alag charge hai aur banne me kuchh din lagte hai. Sales me yahi bolna hai — "ready hai" bilkul mat boliye.' },
      ]),

      H2('Kya-kya jod sakte hai'),
      Bullet('IndiaMART — buyer enquiry seedhe WhatsApp aur CRM me'),
      Bullet('JustDial — lead aate hi customer ko WhatsApp par message'),
      Bullet('TradeIndia, Sulekha jaise doosre portal'),
      Bullet('Aapka apna CRM ya ERP — lead andar, ya lead bahar, dono taraf'),
      Bullet('Website ka form — submit hote hi WhatsApp par'),
      Bullet('WooCommerce ya apni khud ki website — order aate hi WhatsApp par update'),
      Bullet('Tally ya billing software — order ka status WhatsApp par'),

      H2('Isme hota kya hai'),
      P('Jaise hi us portal par koi enquiry aati hai, wo turant hamare system me pahunchti hai — contact ban jata hai, lead ban jaati hai, score lag jata hai, aur customer ko aapka WhatsApp message chala jata hai. Aapki team ko sirf ek jagah dekhni padti hai.'),

      H2('Rate'),
      table(
        ['Kya', 'One-time setup', 'Mahina', 'Kitne din'],
        [
          ['Ek portal (IndiaMART ya JustDial)', '₹9,999', '+ ₹999', '7-10 kaam ke din'],
          ['Dono portal ek saath', '₹14,999', '+ ₹1,499', '10-12 kaam ke din'],
          ['Aapka apna CRM / ERP / software', '₹9,999 se', '+ ₹999 se', 'Dekh kar batayenge'],
          ['Website form se WhatsApp', '₹4,999', '+ ₹499', '3-5 kaam ke din'],
          ['WooCommerce / apni website ke order', '₹7,999', '+ ₹799', '5-7 kaam ke din'],
        ],
        [3000, 1900, 1600, 2520],
      ),
      P('One-time charge banane ka hai. Mahine wala isliye hai ki wo portal apna system badalte rehte hai — toot jaye to hum theek karte hai. Ye customer ko bata dijiye, wajib lagta hai.', { color: MUTED }),

      H2('E-commerce — yahan dhyan se'),
      P('Online dukaan wale customer ke saath do alag baatein hai, aur inhe mila mat dijiye:'),
      Rich([
        { text: 'Jo ABHI ready hai: ', bold: true },
        { text: 'Shopify ke order ka update (confirm, ship, cancel) aur chhoda hua cart yaad dilana. Cart wala kaam Shopify, WooCommerce aur apni website — teeno par chalta hai. Ye All-in-One me shaamil hai, alag charge nahi.' },
      ]),
      Rich([
        { text: 'Jo BANANA padega: ', bold: true },
        { text: 'WooCommerce ya apni khud ki website se order ka poora update. Iska rate upar table me hai.' },
      ]),
      Script('"Sir, aapki Shopify hai to order ka update aur chhoda hua cart dono abhi se chalu ho jayega, isme alag charge nahi. Agar apni website hai to uske liye hum connection bana dete hai — ek baar ka ₹7,999 aur phir ₹799 mahina."'),

      H2('Haan bolne se pehle ye poochh lijiye'),
      P('In teeno ka jawab liye bina date mat dijiye:', { after: 80 }),
      Bullet('Aapka us portal par paid account hai? (IndiaMART ka lead API sirf paid seller ko milta hai)'),
      Bullet('Us account ka login ya API key aap de payenge?'),
      Bullet('Roz kitni lead aati hai wahan se?'),
      Rich([
        { text: 'Agar in me se kisi ka jawab "pata nahi" hai, to boliye ', },
        { text: '"main team se confirm karke aaj hi batata hu"', italics: true },
        { text: ' — aur sach me confirm kijiye. Date de kar peeche hatna sabse bura hai.' },
      ]),

      H2('Pitch kaise kijiye'),
      Script('"Haan sir, IndiaMART ki lead bhi yahi aa jayegi. Ye hum aapke liye banate hai — ek baar ka setup ₹9,999 hai aur phir ₹999 mahina. 7 se 10 din lagte hai. Aapka IndiaMART ka paid account hai na? Uski API key chahiye hogi."'),

      new Paragraph({ children: [new PageBreak()] }),
      // ── 7 ──────────────────────────────────────────────────────────────
      H1('7. Demo kaise dikhaye'),
      P('Demo me feature mat ginayiye. Unka apna case chala kar dikhayiye. Kram ye rakhiye:'),
      Bullet('Unse unka sabse common sawal poochhiye ("customer sabse zyada kya poochhte hai?")'),
      Bullet('Wahi sawal bot se poochh kar dikhayiye — jawab unki hi bhasha me aayega'),
      Bullet('Flow kholiye, "Try it" dabaiye, aur booking poori karke dikhayiye'),
      Bullet('Jaan-boojh kar galat jawab dijiye ("din" ki jagah "ok" likhiye) — bot dobara poochhega. Yahi wo moment hai jahan log impress hote hai.'),
      Bullet('CRM kholiye — lead Hot/Warm/Cold me bat chuki hogi'),
      Bullet('Analytics kholiye — reply time dikhayiye'),
      P('5 minute se zyada mat lijiye.', { bold: true }),

      H2('Proof — ye number bol sakte hai'),
      P('Ye aaj tak ke asli aankde hai. Inse bada mat boliye.', { color: MUTED, after: 80 }),
      table(
        ['Kya', 'Kitna'],
        [
          ['Message handle hue', '84,000+'],
          ['AI ne jawab diye', '38,000+'],
          ['Leads bani', '8,500+'],
          ['Campaign message gaye', '4,00,000+'],
          ['Chal rahe business', '15'],
        ],
        [5000, 4020],
      ),

      Rule(),
      // ── 8 ──────────────────────────────────────────────────────────────
      H1('8. Objection — aur jawab'),
      table(
        ['Customer kehta hai', 'Aap kahiye'],
        [
          ['"Mehnga hai"', 'Ek staff ka mahina kitna hai? Ye usse kam me 24 ghante kaam karta hai, chhutti bhi nahi leta. Aur 3 din free hai — chala ke dekh lijiye.'],
          ['"Mera staff hai na"', 'Staff rahega. Ye raat ka, Sunday ka, aur ek saath 10 message ka kaam sambhal lega. Staff ko sirf serious lead milegi.'],
          ['"Bot galat bol dega"', 'Bot sirf wahi bolta hai jo aap uske knowledge base me dalte hai. Business ke baahar ka sawal aaye to mana kar deta hai. Aur aap har chat dekh sakte hai.'],
          ['"Customer ko pata chal jayega ki bot hai"', 'Bot aapki hi bhasha me baat karta hai. Aur jab bhi zarurat ho, chat aapke staff ko chali jaati hai.'],
          ['"Abhi sochta hu"', 'Bilkul. 3 din free hai, card nahi chahiye. Main abhi setup kar deta hu, aap 3 din chala kar dekh lijiye. Pasand na aaye to kuchh nahi dena.'],
          ['"Setup me time lagega"', 'Ek hafte ke andar poora chaalu. Number connect karna, rate list dena, aur flow banana — bas.'],
          ['"Meta ka charge kitna aayega?"', 'Service message free, utility lagbhag 6 paise, marketing lagbhag 86 paise. Aapke apne Meta account se. Zyadatar business ka mahine ka 200-500 rupaye aata hai.'],
          ['"Data safe hai?"', 'Har business ka data alag rehta hai. Aapke alawa koi dekh nahi sakta. Staff ko aap jitna chaho utna hi access milta hai.'],
        ],
        [2600, 6420],
      ),

      new Paragraph({ children: [new PageBreak()] }),
      // ── 9 ──────────────────────────────────────────────────────────────
      H1('9. Close kaise kare'),
      Script('"Sir, main abhi aapka trial chaalu kar deta hu. Aaj hi aapka number connect ho jayega, main aapki rate list daal dunga, aur kal subah se aapke customers ko jawab milna shuru ho jayega. 3 din baad aap khud bata dena."'),
      P('Close me ye teen cheezein honi chahiye:'),
      Bullet('Aaj kya hoga — number connect, rate list'),
      Bullet('Kal kya hoga — customer ko jawab milna shuru'),
      Bullet('Unko kya karna hai — kuchh nahi, sirf 3 din baad batana'),
      P('Trial ke doosre din khud call kijiye. "Kitne message aaye?" — yahi sawal sale band karwata hai.', { bold: true }),

      Rule(),
      // ── 10 ─────────────────────────────────────────────────────────────
      H1('10. Kya NAHI bolna hai'),
      P('Ye section sabse zaroori hai. Jo cheez product nahi karta, uska vaada karne se refund hota hai aur naam kharab hota hai. In cheezon ka vaada mat kijiye:', { bold: true }),
      table(
        ['Ye mat boliye', 'Asliyat', 'Iski jagah ye boliye'],
        [
          ['"WhatsApp par poora product bech sakte hai, catalogue ke saath"',
           'WhatsApp ke andar catalogue aur checkout abhi nahi bana. Order ka UPDATE bhejna bana hua hai.',
           '"Customer product ke baare me poochh sakta hai aur bot jawab dega. Order aapki site par hoga, aur uska update WhatsApp par apne aap chala jayega."'],
          ['"Payment WhatsApp par le lenge"',
           'In-chat payment abhi nahi bana.',
           '"Payment link aap bhej sakte hai, bot baaki baat sambhal lega."'],
          ['"Form bhar ke de dega WhatsApp ke andar"',
           'Meta ne abhi ise roka hua hai — client ka business verify hona zaroori hai.',
           '"Bot sawal poochh kar sab detail le leta hai."'],
          ['"Telegram aur SMS par bhi chalega"',
           'Abhi sirf WhatsApp aur Instagram.',
           '"Abhi WhatsApp aur Instagram. Aage aur bhi aayenge."'],
          ['"Mobile app milega"',
           'App store par app nahi hai. Mobile browser me app jaisa chalta hai.',
           '"Mobile par kholiye, home screen par laga lijiye — app jaisa hi chalega."'],
          ['"Unlimited sab kuchh"',
           'Trial me limit hai. Meta ke apne limit bhi hai.',
           '"Paid plan me koi limit nahi. Trial me 100 reply aur 1 campaign."'],
        ],
        [2800, 2600, 3620],
      ),
      P('Agar customer koi aisi cheez maange jo list me nahi hai — "pata karke batata hu" boliye. Andaaza mat lagaiye.', { bold: true }),

      Rule(),
      H1('11. Ek line me yaad rakhne layak'),
      Bullet('Pehle unka dard suniye, phir feature boliye — ulta mat kijiye'),
      Bullet('All-in-One (₹4,999) push kijiye, alag-alag add-on se sasta padta hai'),
      Bullet('Trial chaalu karke setup unke saamne kijiye — wahi sabse bada closer hai'),
      Bullet('Meta ke charges pehle hi bata dijiye'),
      Bullet('Jo nahi bana, uska vaada mat kijiye'),
    ],
  }],
});

const out = path.join(__dirname, 'AGENTiX-Sales-Playbook.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log('written:', out, (buf.length / 1024).toFixed(0) + ' KB');
});
