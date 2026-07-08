/**
 * HayHay — Webhook Apps Script pour la Sheet "Coffee Room — Commandes".
 * Reçoit une commande POST depuis /api/order (Flask) et ajoute/maj 1 ligne.
 *
 * DEPLOIEMENT (une seule fois) :
 *  1. Ouvrir la Sheet Coffee Room > menu Extensions > Apps Script
 *  2. Coller ce code (remplacer tout), sauvegarder
 *  3. Déployer > Nouveau déploiement > type "Application Web"
 *     - Exécuter en tant que : Moi
 *     - Qui a accès : Tout le monde
 *  4. Copier l'URL /exec et la donner à Karim (-> Railway env SHEET_WEBHOOK_URL)
 */

var SHEET_ID = '18QCRptHMeooXM8TG0lV1CPw_jIQTTrseALxVbOirsxk';
var TAB = 0; // premier onglet

// nom produit (formulaire) -> index colonne 0-based dans la ligne
var COLMAP = {
  'Butter Croissant': 2,
  'Pain au Chocolat': 3,
  'Almond Croissant': 4,
  'Zaatar Cheese Croissant': 5,
  'Cheddar Cheese Croissant': 6,
  'Pecan Croissant': 7,
  'Double Choco Cookie': 8,
  'Pecan Cookie': 9,
  'Lemon Cream Cookie': 10,
  'Peanut Cookie': 11
};
var NCOLS = 17; // A..Q
var MONTHS = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,
  august:8,september:9,october:10,november:11,december:12};

function fmtDate(s) {
  // "Wednesday, 8 July 2026" -> "08/07/2026" ; sinon renvoie tel quel
  if (!s) return '';
  var m = String(s).match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return String(s);
  var d = ('0' + m[1]).slice(-2);
  var mo = MONTHS[m[2].toLowerCase()];
  if (!mo) return String(s);
  return d + '/' + ('0' + mo).slice(-2) + '/' + m[3];
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var data = JSON.parse(e.postData.contents);
    var sh = SpreadsheetApp.openById(SHEET_ID).getSheets()[TAB];
    var dateLivr = fmtDate(data.delivery);
    var client = data.client || '';

    // construire la ligne
    var row = new Array(NCOLS).fill('');
    row[0] = dateLivr;
    row[1] = 'Formulaire';
    var qtyTot = 0;
    (data.items || []).forEach(function(it) {
      var c = COLMAP[it.name];
      var q = parseInt(it.qty) || 0;
      if (c !== undefined && q > 0) { row[c] = q; qtyTot += q; }
    });
    var ht = (data.ht != null) ? Number(data.ht) : 0;
    var ttc = (data.ttc != null) ? Number(data.ttc) : Math.round(ht * 1.05 * 100) / 100;
    row[12] = qtyTot;
    row[13] = ht.toFixed(2);
    row[14] = ttc.toFixed(2);
    row[15] = 'Formulaire B2B';
    row[16] = 'Commande via order.html' + (client ? (' — ' + client) : '');

    // trouver la ligne TOTAL et une éventuelle ligne existante (même date + formulaire)
    var last = sh.getLastRow();
    var vals = sh.getRange(1, 1, last, NCOLS).getValues();
    var totalRow = -1, existRow = -1;
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][0]).toUpperCase() === 'TOTAL') totalRow = i + 1;
      else if (String(vals[i][0]) === dateLivr && String(vals[i][15]) === 'Formulaire B2B') existRow = i + 1;
    }

    if (existRow > 0) {
      sh.getRange(existRow, 1, 1, NCOLS).setValues([row]); // maj (dédup)
    } else if (totalRow > 0) {
      sh.insertRowBefore(totalRow);
      sh.getRange(totalRow, 1, 1, NCOLS).setValues([row]);
    } else {
      sh.appendRow(row);
    }
    recalcTotal(sh);
    return ContentService.createTextOutput(JSON.stringify({ok: true}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ok: false, error: String(err)}))
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
  for (var r = 1; r < totalRow; r++) {
    n++;
    for (var c = 2; c <= 14; c++) sums[c] += Number(vals[r][c]) || 0;
  }
  var t = vals[totalRow].slice();
  for (var c2 = 2; c2 <= 12; c2++) t[c2] = sums[c2];
  t[13] = sums[13].toFixed(2);
  t[14] = sums[14].toFixed(2);
  t[16] = n + ' livraisons';
  sh.getRange(totalRow + 1, 1, 1, NCOLS).setValues([t]);
}
