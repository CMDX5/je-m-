
// Sélecteurs de base
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const signupBtn = document.getElementById('signupBtn');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const authPanel = document.getElementById('authPanel');
const dashboard = document.getElementById('dashboard');
const authMessage = document.getElementById('authMessage');

const walletBalanceEl = document.getElementById('walletBalance');
const userEmailEl = document.getElementById('userEmail');
const userRoleEl = document.getElementById('userRole');
const userKycStatusEl = document.getElementById('userKycStatus');

const txLabelInput = document.getElementById('txLabel');
const txAmountInput = document.getElementById('txAmount');
const addTxBtn = document.getElementById('addTxBtn');
const txMessage = document.getElementById('txMessage');
const txHistoryEl = document.getElementById('txHistory');

const kycDocType = document.getElementById('kycDocType');
const kycDocFile = document.getElementById('kycDocFile');
const kycSelfieFile = document.getElementById('kycSelfieFile');
const sendKycBtn = document.getElementById('sendKycBtn');
const kycMessage = document.getElementById('kycMessage');

// Helpers
function showMessage(el, text, type = 'info') {
  el.textContent = text;
  el.style.color = type === 'error' ? '#f97373' : (type === 'success' ? '#22c55e' : '#9ca3af');
}

// Création de compte
if (signupBtn) {
  signupBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const pass = passwordInput.value.trim();
    if (!email || !pass) {
      showMessage(authMessage, 'Email et mot de passe obligatoires.', 'error');
      return;
    }
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      const uid = cred.user.uid;

      // Profil utilisateur
      await db.collection('users').doc(uid).set({
        email,
        role: 'client',
        kycStatus: 'none',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Wallet principal
      await db.collection('wallets').doc(uid).set({
        balance: 0,
        currency: 'XAF',
        type: 'main',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      showMessage(authMessage, 'Compte créé avec succès. Vous êtes connecté.', 'success');
    } catch (err) {
      console.error(err);
      showMessage(authMessage, err.message || 'Erreur lors de la création du compte.', 'error');
    }
  });
}

// Connexion
if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const pass = passwordInput.value.trim();
    if (!email || !pass) {
      showMessage(authMessage, 'Email et mot de passe obligatoires.', 'error');
      return;
    }
    try {
      await auth.signInWithEmailAndPassword(email, pass);
      showMessage(authMessage, '');
    } catch (err) {
      console.error(err);
      showMessage(authMessage, 'Connexion impossible : ' + err.message, 'error');
    }
  });
}

// Déconnexion
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => auth.signOut());
}

// Réaction aux changements d'état d'auth
auth.onAuthStateChanged(async (user) => {
  if (user) {
    authPanel.style.display = 'none';
    dashboard.style.display = 'block';
    logoutBtn.style.display = 'inline-flex';

    userEmailEl.textContent = user.email;

    // Charger profil
    const userSnap = await db.collection('users').doc(user.uid).get();
    if (userSnap.exists) {
      const data = userSnap.data();
      userRoleEl.textContent = data.role || 'client';
      userKycStatusEl.textContent = data.kycStatus || 'none';
    }

    // Charger wallet
    const walletSnap = await db.collection('wallets').doc(user.uid).get();
    if (walletSnap.exists) {
      walletBalanceEl.textContent = walletSnap.data().balance ?? 0;
    }

    // Charger historique
    loadTransactions(user.uid);
  } else {
    authPanel.style.display = 'block';
    dashboard.style.display = 'none';
    logoutBtn.style.display = 'none';
    walletBalanceEl.textContent = '0';
    txHistoryEl.innerHTML = '<p class="muted small">Aucune opération pour l’instant.</p>';
  }
});

// Charger transactions
async function loadTransactions(uid) {
  const snap = await db.collection('transactions')
    .where('uid', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  if (snap.empty) {
    txHistoryEl.innerHTML = '<p class="muted small">Aucune opération pour l’instant.</p>';
    return;
  }

  let html = '';
  snap.forEach(doc => {
    const t = doc.data();
    const amount = t.amount || 0;
    const cls = amount >= 0 ? 'pos' : 'neg';
    const date = t.createdAt?.toDate?.() || new Date();
    const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    html += `
      <div class="tx-item">
        <div>
          <div class="tx-label">${t.label || 'Opération'}</div>
          <div class="tx-date">${dateStr}</div>
        </div>
        <div class="tx-amount ${cls}">${amount >= 0 ? '+' : ''}${amount} XAF</div>
      </div>
    `;
  });

  txHistoryEl.innerHTML = html;
}

// Ajout d'opération interne
if (addTxBtn) {
  addTxBtn.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return;

    const label = txLabelInput.value.trim();
    const amount = parseInt(txAmountInput.value, 10);

    if (!label || isNaN(amount)) {
      showMessage(txMessage, 'Libellé et montant obligatoires.', 'error');
      return;
    }

    try {
      const walletRef = db.collection('wallets').doc(user.uid);

      await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(walletRef);
        const currentBalance = snap.exists ? (snap.data().balance || 0) : 0;

        const newBalance = currentBalance + amount;
        if (newBalance < 0) {
          throw new Error('Solde insuffisant pour cette opération.');
        }

        transaction.update(walletRef, {
          balance: newBalance,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        const txRef = db.collection('transactions').doc();
        transaction.set(txRef, {
          uid: user.uid,
          label,
          amount,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });

      showMessage(txMessage, 'Opération enregistrée.', 'success');
      txLabelInput.value = '';
      txAmountInput.value = '';
      walletBalanceEl.textContent = parseInt(walletBalanceEl.textContent, 10) + amount;
      loadTransactions(user.uid);
    } catch (err) {
      console.error(err);
      showMessage(txMessage, err.message || 'Erreur lors de l’opération.', 'error');
    }
  });
}

// KYC
if (sendKycBtn) {
  sendKycBtn.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return;

    const docType = kycDocType.value;
    const docFile = kycDocFile.files[0];
    const selfieFile = kycSelfieFile.files[0];

    if (!docFile || !selfieFile) {
      showMessage(kycMessage, 'Merci de joindre le document et le selfie.', 'error');
      return;
    }

    try {
      const kycId = db.collection('kycRequests').doc().id;

      const docRef = storage.ref(`kyc/${user.uid}/${kycId}_document`);
      const selfieRef = storage.ref(`kyc/${user.uid}/${kycId}_selfie`);

      await docRef.put(docFile);
      await selfieRef.put(selfieFile);

      const docURL = await docRef.getDownloadURL();
      const selfieURL = await selfieRef.getDownloadURL();

      await db.collection('kycRequests').doc(kycId).set({
        uid: user.uid,
        docType,
        docURL,
        selfieURL,
        status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      await db.collection('users').doc(user.uid).update({
        kycStatus: 'pending',
        kycRequestId: kycId
      });

      userKycStatusEl.textContent = 'pending';
      showMessage(kycMessage, 'Dossier KYC envoyé. Statut : pending.', 'success');
    } catch (err) {
      console.error(err);
      showMessage(kycMessage, 'Erreur lors de l’envoi du KYC : ' + err.message, 'error');
    }
  });
}
