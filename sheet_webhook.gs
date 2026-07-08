/**
 * HayHay — Webhook Apps Script pour la Sheet "Coffee Room — Commandes".
 * doPost : reçoit une commande depuis /api/order (Flask) et ajoute/maj 1 ligne.
 * resetSheet : (à lancer 1x depuis l'éditeur) réécrit le tableau canonique propre.
 *
 * MAJ APRES EDITION DU CODE :
 *  - Pour nettoyer : menu déroulant des fonctions -> resetSheet -> Exécuter
 *  - Pour que doPost utilise le nouveau code : Déployer -> Gérer les déploiements
 *    -> crayon -> Version "Nouvelle version" -> Déployer (l'URL /exec reste la même)
 */

var SHEET_ID = '18QCRptHMeooXM8TG0lV1CPw_jIQTTrseALxVbOirsxk';
var TAB = 0;

var COLMAP = {
  'Butter Croissant': 2, 'Pain au Chocolat': 3, 'Almond Croissant': 4,
  'Zaatar Cheese Croissant': 5, 'Cheddar Cheese Croissant': 6, 'Pecan Croissant': 7,
  'Double Choco Cookie': 8, 'Pecan Cookie': 9, 'Lemon Cream Cookie': 10, 'Peanut Cookie': 11
};
var NCOLS = 17;
var MONTHS = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,
  august:8,september:9,october:10,november:11,december:12};

function normDate(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  return String(v || '');
}
function fmtDate(s) {
  if (!s) return '';
  var m = String(s).match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return String(s);
  var mo = MONTHS[m[2].toLowerCase()];
  if (!mo) return String(s);
  return ('0'+m[1]).slice(-2) + '/' + ('0'+mo).slice(-2) + '/' + m[3];
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var data = JSON.parse(e.postData.contents);
    var sh = SpreadsheetApp.openById(SHEET_ID).getSheets()[TAB];
    var dateLivr = fmtDate(data.delivery);

    var row = new Array(NCOLS).fill('');
    row[0] = dateLivr; row[1] = 'Formulaire';
    var qtyTot = 0;
    (data.items || []).forEach(function(it) {
      var c = COLMAP[it.name], q = parseInt(it.qty) || 0;
      if (c !== undefined && q > 0) { row[c] = q; qtyTot += q; }
    });
    var ht = (data.ht != null) ? Number(data.ht) : 0;
    var ttc = (data.ttc != null) ? Number(data.ttc) : Math.round(ht*1.05*100)/100;
    row[12] = qtyTot; row[13] = ht.toFixed(2); row[14] = ttc.toFixed(2);
    row[15] = 'Formulaire B2B'; row[16] = 'Commande via order.html';

    var last = sh.getLastRow();
    var vals = sh.getRange(1, 1, last, NCOLS).getValues();
    var totalRow = -1, existRow = -1;
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][0]).toUpperCase() === 'TOTAL') totalRow = i + 1;
      else if (normDate(vals[i][0]) === dateLivr && String(vals[i][15]) === 'Formulaire B2B') existRow = i + 1;
    }
    sh.getRange(1,1,1,1).setNumberFormat('@'); // garde la colonne date en texte
    if (existRow > 0) {
      sh.getRange(existRow, 1, 1, NCOLS).setValues([row]);
    } else if (totalRow > 0) {
      sh.insertRowBefore(totalRow);
      sh.getRange(totalRow, 1, 1, NCOLS).setValues([row]);
    } else {
      sh.appendRow(row);
    }
    recalcTotal(sh);
    return ContentService.createTextOutput(JSON.stringify({ok:true}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false, error:String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function recalcTotal(sh) {
  var last = sh.getLastRow();
  var vals = sh.getRange(1, 1, last, NCOLS).getValues();
  var totalRow = -1;
  for (var i = 1; i < vals.length; i++) if (String(vals[i][0]).toUpperCase() === 'TOTAL') totalRow = i;
  if (totalRow < 0) return;
  var sums = new Array(NCOLS).fill(0), n = 0;
  for (var r = 1; r < totalRow; r++) { n++; for (var c = 2; c <= 14; c++) sums[c] += Number(vals[r][c]) || 0; }
  var t = vals[totalRow].slice();
  for (var c2 = 2; c2 <= 12; c2++) t[c2] = sums[c2];
  t[13] = sums[13].toFixed(2); t[14] = sums[14].toFixed(2); t[16] = n + ' livraisons';
  sh.getRange(totalRow + 1, 1, 1, NCOLS).setValues([t]);
}

// A LANCER 1x depuis l'éditeur pour nettoyer les doublons de test et réécrire le tableau propre.
function resetSheet() {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheets()[TAB];
  var H = ["Date livraison","N. facture","Croissant Plain (8.40)","Pain au Chocolat (9.80)","Almond Croiss (12.60)","Zaatar-Cheese Croiss (12.60)","Cheddar-Cheese Croiss (12.60)","Pecan Croiss (12.60)","Cookie Double Choc (11.20)","Cookie Pecan (11.20)","Cookie Lemon (11.20)","Cookie Peanut Butter (11.20)","Qte totale","Total HT (AED)","Total TTC 5% (AED)","Source","Notes"];
  var D = [
    ["23/06/2026","2026-104",5,5,10,10,"","",12,12,12,12,78,"880.60","924.63","Reconstruit (chat)","1re livraison. PDF absent. = total devis 880.60"],
    ["24/06/2026","2026-108",3,3,8,10,"","","","","","",24,"281.40","295.47","Facture PDF",""],
    ["25/06/2026","2026-109",2,2,5,6,"","",12,12,12,"",51,"578.20","607.11","Facture PDF",""],
    ["26/06/2026","2026-110",3,3,5,6,"","",12,"","",12,41,"462.00","485.10","Reconstruit (chat)","PDF absent"],
    ["27/06/2026","2026-111",3,3,5,8,"","","",12,"","",31,"352.80","370.44","Reconstruit (chat)","PDF absent"],
    ["28/06/2026","2026-112",3,3,3,8,"","",12,"","","",29,"327.60","343.98","Reconstruit (chat)","PDF absent"],
    ["29/06/2026","2026-113",3,4,4,8,"","","","","","",19,"215.60","226.38","Reconstruit (chat)","PDF absent"],
    ["30/06/2026","2026-114",2,2,"",8,3,4,12,"","","",31,"359.80","377.79","Reconstruit (chat)","PDF absent"],
    ["01/07/2026","2026-118",2,2,"",5,4,3,"","",12,"",28,"322.00","338.10","Reconstruit (chat)","PDF absent"],
    ["02/07/2026","2026-119",2,2,"",5,4,4,12,12,"","",41,"469.00","492.45","Reconstruit (chat)","PDF absent"],
    ["03/07/2026","2026-120",2,2,"",4,3,3,12,"","","",26,"296.80","311.64","Reconstruit (chat)","PDF absent"],
    ["04/07/2026","2026-122",2,2,"",3,3,2,"","","","",12,"137.20","144.06","Reconstruit (chat)","PDF absent"],
    ["05/07/2026","2026-129",2,2,"",2,2,2,"","","",12,22,"234.67","246.40","Facture PDF","Remise appliquee sur facture (HT 234.67)"],
    ["06/07/2026","(a venir)",2,2,"",5,4,3,"","","","",16,"187.60","196.98","Reconstruit (chat)","N. facture pas encore emis"],
    ["07/07/2026","Formulaire",2,2,"",3,3,3,"","","","",13,"149.80","157.29","Formulaire B2B","Commande via order.html"],
    ["08/07/2026","Formulaire",2,2,"",4,3,2,"","","","",13,"149.80","157.29","Formulaire B2B","Commande via order.html"]
  ];
  var T = ["TOTAL","",40,41,40,95,29,26,84,48,36,36,475,"5404.87","5675.11","","16 livraisons"];
  sh.clear();
  var all = [H].concat(D); all.push(T);
  sh.getRange(1, 1, 1, NCOLS).setNumberFormat('@'); // colonne date en texte (dédup fiable)
  sh.getRange(1, 1, 1, NCOLS);
  var colA = sh.getRange(1, 1, all.length, 1); colA.setNumberFormat('@');
  sh.getRange(1, 1, all.length, NCOLS).setValues(all);
  recalcTotal(sh);
}
