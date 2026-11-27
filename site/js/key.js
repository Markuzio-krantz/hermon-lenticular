// "What am I looking at": every visible thing in a step gets a name and a meaning, and a tap makes it blink on the map.
// "Try it": one control per step that changes the cause, with what to look for.
// sw: the swatch (any CSS background; 'line:' prefix draws a line sample), blink: what to flash on the map

const G_THETA = 'linear-gradient(90deg,#3f7df0,#48c79a,#c7c34a,#f06a3c)';
const CLOUD = 'radial-gradient(circle at 40% 40%,#fff,#ffd9e4)';

export const KEY = {
  scene: [
    { sw: CLOUD, name: 'העדשות', blink: 'clouds', text: 'הענן מסימולציית CM1 של אותו ערב: מים שהתעבו בגובה 4–5 ק"מ. הוורוד הוא אור השקיעה שעוד מגיע אליהם.' },
    { sw: 'line:dash', name: 'הקו המקווקו', text: 'גבול תחום החישוב: ריבוע של 64×64 ק"מ סביב החרמון. רק בתוכו מחושבים עננים.' },
    { sw: '#ffd7a8', name: 'שמות', blink: 'labels', text: 'אזורים, פסגות (עם גובה במטרים) וישובים, כדי לדעת איפה אנחנו.' },
  ],
  map: [
    { sw: 'line:dash', name: 'הריבוע המקווקו', text: 'תחום החישוב, 64×64 ק"מ. המפה כולה רחבה 128 ק"מ, מהים התיכון עד שולי דמשק.' },
    { sw: '#ffd7a8', name: 'שמות', blink: 'labels', text: 'החרמון בצפון-מזרח, עמק החולה במרכז, רכס רמים במערב ורמת הגולן במזרח.' },
    { sw: 'linear-gradient(0deg,#6b4a2f,#e8d2b0)', name: 'התבליט', text: 'הגבהים מוגבהים פי 2 כדי שההרים ייראו; המרחקים האופקיים אמיתיים.' },
  ],
  wind: [
    { sw: '#e0b062', name: 'נקודות צהובות', blink: 'flow', text: 'חבילות אוויר יבש. כל נקודה נעה עם הרוח במהירות האמיתית (מואצת).' },
    { sw: '#6fb2ff', name: 'נקודות כחולות', blink: 'flow', text: 'חבילות אוויר לח: אלה שיכולות להפוך לענן אם יורמו מספיק.' },
    { sw: '#ffffff', name: 'נקודות לבנות', blink: 'flow', text: 'חבילה שהתעבתה: היא בתוך ענן. כשהיא יורדת היא שוב נעשית שקופה.' },
    { sw: '#ffe2c4', name: 'חיצי הרוח', blink: 'wind', text: 'עמוד במעלה הרוח: חץ לכל קילומטר גובה, ואורכו מהירות הרוח שם. כולם פונים מזרחה: כיוון אחיד לאורך הגובה שומר על גל מסודר.' },
  ],
  layers: [
    { sw: G_THETA, name: 'צבע המשטחים', blink: 'stack', text: 'כל משטח הוא שכבת אוויר. הצבע הוא θ, הטמפרטורה שהאוויר היה מקבל אילו הורד לגובה פני הים: כחול נמוכה, כתום גבוהה.' },
    { sw: 'linear-gradient(90deg,#fff 0 50%,#9cc4ff 50%)', name: 'התוויות בקצה', text: 'גובה, הטמפרטורה האמיתית ו-θ. למעלה קר יותר, אבל θ גבוהה יותר: האוויר העליון "קל" מהתחתון, וזה הקפיץ.' },
    { sw: 'line:flat', name: 'משטחים שטוחים', text: 'עוד לא פגשו את ההר. ככל שהמרווח בין שני צבעים קטן יותר, הקפיץ קשיח יותר.' },
  ],
  thermal: [
    { sw: '#5aa9ff', name: 'הקו הכחול', text: 'הטמפרטורה של האוויר מסביב בכל גובה, כפי שנמדדה בבלון של אותו ערב (או של יום לא יציב).' },
    { sw: '#ff9b5a', name: 'הקו הכתום', text: 'הטמפרטורה של בועה שעולה מהקרקע: מתקררת כ-10° לכל ק"מ, ואחרי שהתעבתה רק כ-6°.' },
    { sw: '#ffffff', name: 'הענן הלבן', text: 'מהגובה שבו הבועה מגיעה לנקודת הטל (בסיס הענן) ועד שהיא נעשית קרה מהסביבה (ראש הענן).' },
    { sw: 'rgb(255 155 90 / .25)', name: 'האזור הכתום', text: 'כל עוד הבועה חמה מהסביבה היא קלה ממנה וממשיכה לעלות: זו טרמיקה.' },
  ],
  wave: [
    { sw: 'linear-gradient(90deg,#1d3a78,#7fb3ff)', name: 'בהיר וכהה', blink: 'stack', text: 'בהיר: האוויר הורם מעל הגובה שלו. כהה: הונמך. הצבע עדיין θ, כמו בשלב הקודם.' },
    { sw: '#fff', name: 'פסגה ושקע', text: 'בפסגת הגל האוויר הכי גבוה והכי קר, ושם נולד ענן. בשקע הוא יורד ומתחמם, והשמיים נקיים.' },
    { sw: 'transparent', name: '×2.5', text: 'הגל מוגדל פי 2.5 לתצוגה. באמת הוא מרים את האוויר כ-300–500 מ\'.' },
  ],
  moist: 'curtain', birth: 'curtain',
  curtain: [
    { sw: 'line:blue', name: 'קווים כחולים עבים', blink: 'curtain', text: 'שכבות לחות (מעל 60%). כל קו הוא שכבת אוויר אחת, ועוביו לפי הלחות. הקו עולה ויורד בדיוק כמו שהאוויר עלה וירד בסימולציית CM1.' },
    { sw: 'line:amber', name: 'קווים צהובים דקים', blink: 'curtain', text: 'שכבות יבשות (מתחת ל-52%). גם אם יעלו, לא יגיעו לרוויה ולא ייצרו ענן.' },
    { sw: 'linear-gradient(90deg,#3d8fe8,#bfe6ff)', name: 'כחול שמתבהר', text: 'השכבה מתקרבת לרוויה: היא הורמה כמעט מספיק כדי להתעבות.' },
    { sw: CLOUD, name: 'לבן זוהר', text: 'ענן: כאן הסימולציה חישבה מים מעובים. האוויר הורם, התקרר לנקודת הטל, והאדים הפכו לטיפות.' },
    { sw: 'linear-gradient(90deg,#5aa9ff 0 60%,#e0b062 60%)', name: 'הפסים בקצה', text: 'הלחות שנמדדה בבלון בכל גובה. אורך הפס הוא אחוז הלחות: ארוך וכחול לח, קצר וצהוב יבש.' },
    { sw: 'line:grey', name: 'קווים אפורים', text: 'סימוני גובה, כל קילומטר.' },
  ],
  through: [
    { sw: '#6fb2ff', name: 'כחול: עולה', blink: 'journey', text: 'החבילה מטפסת על הגל ומתקררת, עוד לא רוויה.' },
    { sw: '#ffffff', name: 'לבן: בתוך הענן', blink: 'journey', text: 'היא הגיעה לנקודת הטל: האדים שלה התעבו. זה רגע הכניסה לעדשה.' },
    { sw: '#e0b062', name: 'צהוב: יורדת', blink: 'journey', text: 'היא יורדת, מתחממת, והטיפות מתאדות. הענן נשאר מאחור.' },
    { sw: 'line:path', name: 'המסלול', blink: 'journey', text: 'קו הזרם שהחבילה רוכבת עליו, מתוך סימולציית CM1. האוויר זורם דרכו כל הזמן, והענן עומד.' },
  ],
  light: [
    { sw: '#6a4aa8', name: 'המשטח הסגול', blink: 'shadow', text: 'גבול הצל של כדור הארץ. מתחתיו השמש כבר שקעה, מעליו עוד רואים אותה. הגובה שלו נקבע רק מזווית השמש ומהעקמומיות של כדור הארץ.' },
    { sw: '#ff9ab6', name: 'עננים ורודים', blink: 'clouds', text: 'רק מה שמעל הגבול מקבל את האור האדום של השקיעה. העדשות ב-4–5 ק"מ נשארות מוארות עוד כעשר דקות.' },
  ],
  train: [
    { sw: CLOUD, name: 'עדשות', blink: 'clouds', text: 'בסימולציית CM1 של אותו ערב נוצרה עדשה עיקרית אחת. רכבת של כמה עדשות צריכה רוח חזקה יותר למעלה: נסו בעצמכם.' },
  ],
  family: [
    { sw: '#ff5a4e', name: 'טבעות אדומות', blink: 'rotors', text: 'רוטורים: מתחת לפסגות הגל, ליד הקרקע, הרוח מתהפכת ויוצרת מערבולות. מחושב במודל המהיר.' },
    { sw: CLOUD, name: 'ענן כובע ועדשה', blink: 'clouds', text: 'ענן הכובע יושב על הפסגה עצמה, מאוויר שמטפס על המדרון. העדשה מרחפת קילומטרים מעליו, באוויר חופשי.' },
  ],
};

// one control per step. p: a model parameter (shows the quick model, which answers at once); v: 'sun' works with CM1 too
export const TRY = {
  layers: { p: 'stabilityScale', label: 'יציבות האוויר', min: 0.2, max: 3, step: 0.05, look: 'עקבו אחרי θ בתוויות: ביציבות גבוהה θ עולה מהר עם הגובה, והקפיץ קשיח.' },
  wave: { p: 'windScale', label: 'עוצמת הרוח', min: 0.3, max: 2.2, step: 0.05, look: 'רוח חזקה מותחת את הגל: אורך הגל הוא בערך 2πU/N. רוח חלשה מדי והגל כמעט נעלם.' },
  moist: { p: 'rhOffset', label: 'לחות בכל הגבהים', min: -30, max: 30, step: 1, look: 'הוסיפו לחות: עוד קווים מלבינים. הורידו: הענן נעלם, אף שהגל עצמו לא השתנה.' },
  birth: { p: 'lensBoost', label: 'לחות השכבה ב-3.8 ק"מ', min: 0, max: 30, step: 1, look: '5% לחות קובעים אם יהיה ענן: בלי תוספת הגל מרים 350 מ\', וצריך 400.' },
  light: { v: 'sun', label: 'גובה השמש (מעלות)', min: -4, max: 6, step: 0.1, look: 'הורידו את השמש מתחת לאופק: גבול הצל עולה, העמק מחשיך, ובסוף גם העדשות מאבדות את הוורוד.' },
  train: { p: 'upperBoost', label: 'זרם סילון מעל 5 ק"מ', min: 0, max: 3, step: 0.1, look: 'רוח חזקה למעלה כולאת את הגל מתחתיה: הוא חוזר שוב ושוב במורד הרוח, ומופיעה רכבת עדשות.' },
  family: { p: 'blockFactor', label: 'עוצמת החסימה', min: 0, max: 1, step: 0.05, look: 'חסימה חזקה: האוויר הנמוך עוקף את ההר במקום לטפס, והגל והרוטורים נחלשים.' },
};

// what-if runs of CM1 (same model, same night, one thing changed), offered beside the quick-model slider
export const RUNS = { base: 'כפי שנמדד', wind15: 'רוח פי 1.5', jet: 'זרם סילון', dry: 'יבש יותר', moist: 'לח יותר' };
export const STEP_RUNS = { wave: ['base', 'wind15'], moist: ['base', 'dry', 'moist'], birth: ['base', 'dry', 'moist'], through: ['base', 'wind15'], train: ['base', 'jet'], family: ['base', 'wind15'] };

export function keyFor(id) { let k = KEY[id]; if (typeof k === 'string') k = KEY[k]; return k || []; }

export function swatch(sw) {
  if (sw.startsWith('line:')) {
    const t = sw.slice(5), st = { dash: 'border-top:2px dashed #fff', flat: 'border-top:3px solid #48c79a', blue: 'border-top:4px solid #5aa9ff', amber: 'border-top:1.5px solid #e0b062', grey: 'border-top:1px solid rgb(255 255 255 / .5)', path: 'border-top:2px solid #9fd0ff' }[t];
    return `<i class="ln" style="${st}"></i>`;
  }
  return `<i style="background:${sw}"></i>`;
}
