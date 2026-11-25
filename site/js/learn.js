// Learn: short topics that sit beside the lab. Each one says what to look at on the map and
// offers an experiment that sets the lab up for it.
export const TOPICS = [
  { id: 'stability', title: 'יציבות: האוויר כקפיץ', short: 'למה אוויר שהורם חוזר למטה',
    body: [
      'באוויר יציב, חבילה שמורמת נעשית קרה וכבדה מהאוויר שסביבה, ונמשכת חזרה לגובה שממנו באה. היא עוברת אותו, עולה שוב, וכך נוצרת תנודה.',
      'המדד הוא תדירות הציפה N. ככל שהיא גבוהה יותר, הקפיץ קשיח יותר והתנודה מהירה יותר. כשהטמפרטורה עולה עם הגובה (אינוורסיה), N גבוה במיוחד.',
      'הטמפרטורה הפוטנציאלית θ היא הטמפרטורה שהאוויר היה מקבל אילו הורד לגובה פני הים. כש-θ עולה עם הגובה, האוויר יציב.',
    ],
    look: 'הפעילו "שכבות אוויר": כל משטח הוא θ אחר. כשהיציבות נמוכה, המשטחים כמעט לא מתעקמים.',
    try: { label: 'הורידו את היציבות', params: { stabilityScale: 0.35 }, layers: { stack: true }, view: 'layersView', slider: 'stabilityScale' } },
  { id: 'wave', title: 'גל עומד ואורך גל', short: 'איך ההר יוצר גל שלא זז',
    body: [
      'ההר דוחף את האוויר למעלה, הקפיץ מחזיר אותו, והאוויר ממשיך להתנודד בזמן שהוא זורם במורד הרוח. התוצאה היא גל שצורתו קבועה ביחס להר.',
      'אורך הגל הוא בערך 2πU/N: רוח מהירה מותחת את הגל, יציבות חזקה מקצרת אותו. באירוע: רוח של 10 מ\'/ש ו-N של כ-0.011, ולכן גל של כ-5.7 ק"מ.',
    ],
    look: 'בחתך ההיווצרות רואים את הקווים עולים ויורדים. הגדילו את הרוח וראו את הגל מתארך.',
    try: { label: 'חזקו את הרוח', params: { windScale: 1.6 }, layers: { curtain: true }, view: 'curtain', slider: 'windScale' } },
  { id: 'saturation', title: 'רוויה ונקודת טל', short: 'מתי אדי מים הופכים לענן',
    body: [
      'אוויר שעולה מתפשט ומתקרר בכ-1°C לכל 100 מ\'. כשהוא מתקרר עד נקודת הטל, האדים מתעבים לטיפות. כמה צריך להרים? תלוי בלחות: ב-82% כ-400 מ\', ב-92% כ-150 מ\'.',
      'לכן העדשה מופיעה רק במקום שבו הגל מרים שכבה לחה יותר ממה שהיא צריכה. בירידה האוויר מתחמם והטיפות מתאדות, ולכן לענן יש קצוות חדים.',
    ],
    look: 'הפעילו "שכבה לחה": תכלת קרוב לרוויה, לבן רווי. הזיזו את הלחות וראו את הכתמים הלבנים גדלים.',
    try: { label: 'הוסיפו לחות', params: { lensBoost: 20 }, layers: { moist: true }, view: 'hermon', slider: 'lensBoost' } },
  { id: 'froude', title: 'חסימה ומספר פרוד', short: 'מתי האוויר עוקף את ההר',
    body: [
      'לא כל האוויר מטפס על ההר. אוויר איטי בשכבה יציבה אין לו מספיק אנרגיה, והוא עוקף את ההר מהצדדים. רק האוויר שמעל "קו הזרם המפריד" עובר מעל הפסגה.',
      'מספר פרוד, Fr = U/(N·H), משווה בין מהירות הרוח לגובה ההר. מתחת לכ-0.5 רוב האוויר הנמוך נחסם. לחרמון באותו ערב Fr היה כ-0.24.',
    ],
    look: 'הפעילו "זרימת אוויר" והחלישו את הרוח: החבילות הנמוכות נעלמות ליד ההר, כי הן עוקפות אותו.',
    try: { label: 'החלישו את הרוח', params: { windScale: 0.5 }, layers: { flow: true }, view: 'overview', slider: 'windScale' } },
  { id: 'scorer', title: 'לכידת גלים: פרמטר סקורר', short: 'מאיפה מגיעה רכבת עדשות',
    body: [
      'כשהרוח בגובה רב חזקה הרבה יותר מהרוח למטה, הגל לא מצליח להמשיך לעלות. השכבה העליונה פועלת כמו תקרה שמחזירה אותו למטה, והגל נלכד בין התקרה לקרקע.',
      'הגל הלכוד חוזר שוב ושוב במורד הרוח, וכל פסגה יכולה ליצור עדשה. המדד הוא פרמטר סקורר, N²/U²: כשהוא יורד בחדות עם הגובה, יש לכידה.',
    ],
    look: 'חזקו את זרם הסילון וראו את רכבת העדשות נמתחת מזרחה מהחרמון.',
    try: { label: 'הוסיפו זרם סילון', params: { upperBoost: 2, lensBoost: 14 }, layers: {}, view: 'region', slider: 'upperBoost' } },
  { id: 'shadow', title: 'למה רק העננים ורודים', short: 'צל כדור הארץ אחרי השקיעה',
    body: [
      'אחרי שהשמש שוקעת לצופה בעמק, הקרניים שלה עדיין עוברות מעל האופק ומאירות את מה שגבוה מספיק. גבול הצל של כדור הארץ עולה ככל שהשמש יורדת.',
      'כשהשמש 1° מתחת לאופק, כל מה שמתחת לכ-1 ק"מ בצל; ב-2°, כל מה שמתחת לכ-3.9 ק"מ. לכן העמק כבר חשוך, והעדשות בגובה 3.9 ק"מ עוד ורודות כעשר דקות.',
    ],
    look: 'הזיזו את "גובה השמש" מתחת לאפס וראו את העמק מחשיך לפני העננים.',
    try: { label: 'הורידו את השמש', sun: -1.6, layers: {}, view: 'hula', slider: 'sun' } },
  { id: 'ice', title: 'טיפות, קרח וזנב סיבי', short: 'למה השוליים חדים',
    body: [
      'באותו ערב העדשות היו בטמפרטורה של 0 עד 2°C: טיפות מים זעירות, שמתאדות מיד כשהאוויר יורד. לכן השוליים חלקים וחדים.',
      'בענן קר מ-15°C- חלק מהטיפות קופאות. גביש קרח מתאדה לאט יותר מטיפה, ולכן הקצה במורד הרוח נמרח לזנב סיבי.',
    ],
    look: 'העלו את השכבות הלחות לגובה של כ-6.5 ק"מ ובדקו את הטמפרטורה בראש העדשה.',
    try: { label: 'העלו את השכבות הלחות', params: { moistShift: 2500, lensBoost: 12 }, layers: {}, view: 'hermon', slider: 'moistShift' } },
  { id: 'family', title: 'משפחת העננים של ההר', short: 'כובע, עדשה ורוטור',
    body: [
      'ענן כובע נוצר מאוויר נמוך שמטפס על המדרון עצמו ונצמד לפסגה. עדשה נוצרת באוויר חופשי, קילומטרים מעל הקרקע, ורוכבת על הגל.',
      'מתחת לפסגות הגל, ליד הקרקע, הזרימה יכולה להתהפך וליצור מערבולת אופקית: רוטור. זה אחד המקומות המסוכנים ביותר לטיסה קלה.',
    ],
    look: 'הפעילו "רוטורים": הטבעות האדומות מסמנות היכן הרוח ליד הקרקע מתהפכת.',
    try: { label: 'הציגו רוטורים', params: { upperBoost: 1.8, lensBoost: 14 }, layers: { rotors: true }, view: 'hermon', slider: 'upperBoost' } },
  { id: 'model', title: 'איך ההדמיה מחשבת', short: 'מהנתונים אל העננים',
    body: [
      'הקלט: הטופוגרפיה (SRTM), השיגור של בית דגן (טמפרטורה, לחות ורוח בכל גובה), ורוחות מהר כנען. המודל פותר את משוואת גלי ההרים לכל גודל של גבעה ועמק, בשכבות של 100 מ\'.',
      'הפלט: כמה כל קו זרם עולה או יורד בכל נקודה. במקום שבו ההרמה עוברת את מה שהשכבה צריכה כדי להגיע לרוויה, נוצר ענן. החישוב רץ בדפדפן בכחצי שנייה.',
      'מגבלות: המודל לינארי, ולכן לא מדמה ערבול, רוטורים אמיתיים או ענני ערמה. עוצמת החסימה ותוספת הלחות בשכבה של 3.8 ק"מ מכוילות לתצפית.',
    ],
    look: 'פתחו "מחקר נוסף" במעבדה: החתך והפרופיל מראים את אותם מספרים שהמודל משתמש בהם.',
    try: { label: 'פתחו את המכשירים', params: {}, layers: {}, view: 'overview', research: true } },
];

export function initLearn(host, onTry) {
  let current = null, opener = null;
  host.innerHTML = `<header class="learn-head"><button class="info" type="button" data-a="back" aria-label="חזרה לרשימה" hidden>→</button><h2 id="learnTitle">ללמוד</h2><button class="info" type="button" data-a="close" aria-label="סגירה">×</button></header><div class="learn-body" id="learnBody"></div>`;
  const body = host.querySelector('#learnBody'), title = host.querySelector('#learnTitle'), back = host.querySelector('[data-a=back]');
  host.querySelector('[data-a=close]').onclick = () => api.close();
  back.onclick = () => list();
  function list() {
    current = null; back.hidden = true; title.textContent = 'ללמוד';
    body.innerHTML = `<p class="note">נושאים קצרים, כל אחד עם ניסוי שמכין את המעבדה.</p><div class="topics">${TOPICS.map(t => `<button type="button" class="topic" data-id="${t.id}"><b>${t.title}</b><span>${t.short}</span></button>`).join('')}</div>`;
    body.querySelectorAll('.topic').forEach(b => { b.onclick = () => show(b.dataset.id); });
    body.querySelector('.topic')?.focus();
  }
  function show(id) {
    const t = TOPICS.find(x => x.id === id); if (!t) return list();
    current = t; back.hidden = false; title.textContent = t.title;
    body.innerHTML = `${t.body.map(p => `<p>${p}</p>`).join('')}<div class="look"><b>מה לראות במפה</b><p>${t.look}</p></div>
      <button class="btn primary" type="button" data-a="try">${t.try.label} · נסו במעבדה</button>`;
    body.querySelector('[data-a=try]').onclick = () => onTry(t.try, t);
    body.scrollTop = 0; body.querySelector('[data-a=try]').focus();
  }
  const api = {
    open(id, from) { opener = from || document.activeElement; host.hidden = false; id ? show(id) : list(); },
    close() { host.hidden = true; opener?.focus?.(); },
    get isOpen() { return !host.hidden; },
    get current() { return current; },
  };
  return api;
}
