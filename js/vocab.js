// Word lists used by the classifier. All lowercase.
const set = s => new Set(s.trim().split(/\s+/));

// Structural words that are safe to leave visible (labels, headings, column titles).
export const LABELS = set(`
a about account accounts acct address addresses age all allergies also amount amounts an and annual answer any appendix applicant approval approved approver apt are as at attachment attachments available ave avenue
balance bank banking bcc be beginning beneficiary bill billed billing birth blvd born branch business buyer by
card cards category cc cell charge charges check checked checking citizenship city claim claims class clinic closing co code color colour comment comments company condition conditions contact contacts copay corp corporation cost costs county country coverage credit current customer customers
daily date dates day days dear debit deduction deductions deductible deliver delivery department dependent dependents dept desc description detail details diagnosis discount division doctor dob down dr due
each earnings effective email e-mail emergency employee employees employer end ended ending ein exhibit exp expiration expires expiry eye eyes
family fax fee fees figure first floor form forms from full fw fwd
gender general given gross group gst guardian
hair handling height hello hi home hospital hour hours hrs
id identification ids if in inc income info information initial initials insurance insured into invoice invoices is issue issued issuer it item items its
job
last legal level license licence line lines llc login ltd
madam maiden make marital married medical medication member members memo message messages middle min minutes miss mobile model month monthly months mr mrs ms
n/a na name names nationality net new next nickname no none not note notes num number numbers nbr
occupation of off office old on only opening optional or order orders org organization other our out over
page pages paid part parts password patient patients pay payable payment payments pending per period personal phone phones physician pin plan plans plate please po policy policyholder position post postal preferred premium previous price prices primary print prior product products prof province provider purchase
qty quantity quarterly question
race rank rate rates rd re receipt receipts receivable received reference ref regards region registration relation relationship remarks reply report reports required road role routing
salary same savings schedule secondary section sections security see seller sent service services sex ship shipped shipping sign signature signatures signed since single sir site sold sort st staff start started state statement statements status ste street sub subject subtotal suite summary supplier surname swift
table tax taxable taxes team tel telephone term terms than thank thanks that the their then these this those time times tin title to total totals town transaction transactions transfer transfers transit type
under unit units unpaid until up url us usa user username
valid vat vendor via visit
wage wages website web week weekly weeks weight withdrawal withdrawals with witness work
year years yes you your zip zipcode
`);

export const MONTHS = set(`january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec`);

export const STREET = set(`street st avenue ave road rd boulevard blvd lane ln drive dr court ct way place pl terrace ter circle cir parkway pkwy highway hwy trail trl square sq suite ste apt apartment unit floor fl`);

export const STATES = set(`al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc pr`);

export const TITLES = set(`mr mrs ms miss mx dr prof sir madam rev hon`);

// Common first names (US). Words that are also everyday English words are left out.
export const FIRST = set(`
aaron abigail adam adrian aiden alan albert alex alexa alexander alexandra alexis alice alicia alison allison alyssa amanda amber amelia amy ana andre andrea andrew angela angelina anita ann anna anne annie anthony antonio ariana arthur ashley austin ava avery
barbara benjamin beth betty beverly blake bonnie bradley brandon brenda brian brianna brittany brooke bruce bryan
caleb cameron camila carl carlos carmen carol caroline carolyn carter catherine charles charlotte chelsea cheryl chloe chris christian christina christine christopher cindy claire clara cody colin connor craig crystal cynthia
daisy dakota dale dalton dana daniel danielle david deborah debra denise dennis derek diana diane diego donald donna dorothy douglas dustin dylan
edward eleanor elena eli elijah elizabeth ella ellie emily emma eric erica erin ethan eugene eva evan evelyn
felicia fernando fiona frances francisco gabriel gabriella gary george gerald gina gloria gregory gwen
hailey hannah harold harper harry hayden heather helen henry holly howard
ian isaac isabel isabella isaiah ivan
jacob jacqueline jaden james jamie janet janice jared jasmine jason javier jeffrey jennifer jenny jeremy jerry jesse jessica jesus joan joe joel john johnny jonathan jordan jorge jose joseph joshua joyce juan judith judy julia julian julie justin
kaitlyn karen katherine kathleen kathryn kathy katie kayla keith kelly kenneth kevin kim kimberly kristen kyle
landon laura lauren lawrence leah leo leonard liam lillian lily linda lisa logan lori louis lucas lucy luis luke lydia
mackenzie madeline madison maria marie marilyn mario marissa martha martin mary mason matthew megan melanie melissa mia michael michelle miguel mila miranda molly monica morgan
nancy naomi natalie nathan nathaniel nicholas nicole noah nora norma
olivia oliver omar oscar owen
pamela patricia patrick paul paula peter philip phillip priya
rachel ralph randy rebecca regina riley robert roberto rodney roger ronald ruby russell ruth ryan
sabrina samantha samuel sandra sara sarah savannah scott sean sebastian sergio shannon sharon shawn sheila shirley sofia sophia sophie stephanie stephen steven susan sydney
tammy tara taylor teresa terry theresa thomas tiffany timothy tina todd tony travis tyler
valerie vanessa veronica victor victoria vincent virginia walter wayne wendy william wyatt
xavier yolanda zachary zoe
`);

// Common surnames (US).
export const LAST = set(`
adams allen alvarez anderson bailey baker barnes bell bennett brooks brown bryant butler campbell carter castillo chavez clark coleman collins cook cooper cox cruz davis diaz edwards evans fisher flores foster garcia gomez gonzalez gray green griffin gutierrez hall hamilton harris hayes henderson hernandez hill howard hughes jackson james jenkins jimenez johnson jones kelly kim king lee lewis long lopez martin martinez mendoza miller mitchell moore morales morgan morris murphy myers nelson nguyen ortiz parker patel perez perry peterson phillips powell price ramirez ramos reed reyes richardson rivera roberts robinson rodriguez rogers ross russell sanchez sanders scott smith stewart sullivan taylor thomas thompson torres turner walker ward washington watson white williams wilson wood wright young doe
`);

// Label keywords → the category of the value that follows them.
export const CONTEXT = [
  ['emails', /\b(e-?mail|email address)\b/],
  ['phones', /\b(phone|tel|telephone|mobile|cell|fax|contact number)\b/],
  ['links', /\b(website|url|web|username|user ?name|handle|login|user)\b/],
  ['dates', /\b(date|dob|birth|born|issued|expires|expiry|expiration|exp|effective|period|due date|since|until)\b/],
  ['amounts', /\b(total|amount|balance|price|cost|fee|subtotal|tax|paid|due|salary|wage|pay|payment|credit|debit|charge|deposit|withdrawal|net|gross|premium|copay|deductible)\b/],
  ['ids', /\b(account|acct|id|ssn|social|card|routing|policy|member|invoice|order|ref|reference|number|no|license|licence|passport|claim|case|ticket|tracking|serial|vin|ein|tin|iban|swift|pin|plate|group)\b|#/],
  ['addresses', /\b(address|street|city|state|zip|postal|residence|location|ship to|mailing)\b/],
  ['names', /\b(name|customer|patient|employee|client|insured|applicant|holder|owner|contact|attn|attention|to|from|bill to|sold to|prepared by|signed|signature|dear|driver|beneficiary|physician|doctor|provider|recipient|sender|payee|guardian|spouse|cardholder|manager|supervisor|agent|rep)\b/],
];
