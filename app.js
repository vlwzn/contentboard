// FIREBASE CONFIGURATION
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, get, update, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2-cj9k_J9FDovpLz3l-kCAIvGjckmQtM",
  authDomain: "contentboardpro.firebaseapp.com",
  databaseURL: "https://contentboardpro-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "contentboardpro",
  storageBucket: "contentboardpro.firebasestorage.app",
  messagingSenderId: "133243951273",
  appId: "1:133243951273:web:fb31eddd1bfcc40e95f1b8"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app); 
const googleProvider = new GoogleAuthProvider();

// GLOBAL STATE
let myUser = null; 
let workspaces = []; 
let sharedWorkspaces = []; 
let activeWsId = null;
let isOwner = true; 
let wsMembers = {}; 

let unsubscribeWs = null;
let unsubscribeSharedWs = null;
let unsubscribeBoard = null;

// STATE CREATORS (PJ IDE EKSKLUSIF)
let brands=[], cards=[], columns=[], creators=[], themeSettings = { color: '#534AB7', bg: '', bgPos: '50% 50%' };
let aB='all', selId=null, mType='Video', bCol="#534AB7", cCol="#534AB7", editBrandId=null, editColId=null, editWsId=null, cardToMoveId=null;
let tempImgObj = new Image(); let imgRotation = 0; 
let isRepoMode = false, startY, startPos;

// HELPER: UTILS & UI
window.allowDrop = (e) => { e.preventDefault(); e.stopPropagation(); };
window.hideCtxMenu = () => { const ctx = document.getElementById('ctx-menu'); if (ctx) ctx.style.display = 'none'; };

document.addEventListener('click', () => { 
    hideCtxMenu();
    document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('show'));
    const filterPanel = document.getElementById('filter-panel');
    if (filterPanel) filterPanel.classList.remove('show');
});

window.toggleMenu = (id, e) => {
    e.stopPropagation();
    document.querySelectorAll('.custom-dropdown').forEach(d => { if(d.id !== id) d.classList.remove('show') });
    const filterPanel = document.getElementById('filter-panel');
    if (filterPanel && id !== 'filter-panel') filterPanel.classList.remove('show');
    document.getElementById(id).classList.toggle('show');
};

window.showMsg = (txt, cb) => {
    document.getElementById('msg-text').innerHTML = txt;
    const ok = document.getElementById('msg-ok'), cancel = document.getElementById('msg-cancel');
    if(cancel) cancel.style.display = cb && cb.name !== 'closeOnly' ? 'block' : 'none';
    const clean = () => { document.getElementById('msg-ov').classList.remove('show'); if(ok) ok.onclick = null; if(cancel) cancel.onclick = null; };
    ok.onclick = () => { clean(); if(cb) cb(); };
    if(cancel) cancel.onclick = clean;
    document.getElementById('msg-ov').classList.add('show');
};

window.toggleDarkMode = () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('cb_theme', isDark ? 'light' : 'dark');
};
if(localStorage.getItem('cb_theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

window.resetFilters = () => {
    document.getElementById('filter-month').value = '';
    document.getElementById('filter-week').value = 'all';
    document.getElementById('filter-type').value = 'semua';
    document.getElementById('filter-objective').value = 'all';
    document.getElementById('filter-urgency').value = 'all';
    if(document.getElementById('filter-creator')) document.getElementById('filter-creator').value = 'all';
    if(document.getElementById('filter-assignee')) document.getElementById('filter-assignee').value = 'all';
    document.getElementById('sort-by').value = 'manual';
    document.getElementById('search-input').value = '';
    renderBoard();
    document.getElementById('filter-panel').classList.remove('show');
};

// ================= FILTER LOGIC UNTUK PDF & BOARD =================
let searchDebounce;
window.handleSearch = () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(renderBoard, 300);
};

window.getFilteredCards = () => {
    const fMonth = document.getElementById('filter-month').value, fWeek = document.getElementById('filter-week').value, fUrg = document.getElementById('filter-urgency').value, fType = document.getElementById('filter-type').value, fObj = document.getElementById('filter-objective').value, fAss = document.getElementById('filter-assignee') ? document.getElementById('filter-assignee').value : 'all', fCre = document.getElementById('filter-creator') ? document.getElementById('filter-creator').value : 'all', sq = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    return cards.filter(c => { 
        let mB = (aB==='all' || c.bId===aB), mT = (fType==='semua' || c.type===fType), mM = true, mW = true, mU = (fUrg === 'all' || (c.urgency || 'normal') === fUrg), mObj = (fObj === 'all' || (c.objective || 'Konten') === fObj), mAss = (fAss === 'all' || (fAss === 'unassigned' ? (!c.assignee || c.assignee === '') : c.assignee === fAss)), mCre = (fCre === 'all' || (fCre === 'unassigned' ? (!c.creator || c.creator === '') : c.creator === fCre)), mS = sq ? (c.title.toLowerCase().includes(sq) || (c.notes && c.notes.toLowerCase().includes(sq))) : true; 
        if (c.type === 'Catatan' || c.type === 'To-Do') { mObj = true; } else { if (fMonth && c.date) mM = c.date.startsWith(fMonth); else if (fMonth && !c.date) mM = false; mW = (fWeek === 'all' || c.week === fWeek); } 
        return mB && mT && mM && mW && mU && mObj && mAss && mCre && mS; 
    });
};

// ================= AUTHENTICATION =================
window.isRegistering = false;

window.updateMyAvatarUI = () => {
    const av = document.getElementById('user-avatar');
    if(myUser && myUser.photoURL) {
        av.innerHTML = `<img src="${myUser.photoURL}" style="width:100%; height:100%; border-radius:inherit; object-fit:cover;" onerror="this.outerHTML='${myUser.name.charAt(0).toUpperCase()}'">`;
    } else {
        av.textContent = myUser ? myUser.name.charAt(0).toUpperCase() : 'A';
    }
};

onAuthStateChanged(auth, (user) => {
    if (window.isRegistering) return;
    const loginOv = document.getElementById('login-ov');
    const authContent = document.getElementById('auth-content');
    const authLoading = document.getElementById('auth-loading');
    
    if (user) {
        if (user.providerData[0] && user.providerData[0].providerId === 'password' && !user.emailVerified) {
            authLoading.style.display = 'none';
            authContent.style.display = 'block';
            showMsg("Email Anda belum diverifikasi. Silakan cek inbox/spam, lalu coba masuk lagi.");
            signOut(auth); return;
        }
        myUser = { id: user.uid, name: user.displayName || user.email.split('@')[0], email: user.email, photoURL: user.photoURL || null };
        set(ref(db, `public_users/${myUser.id}`), { name: myUser.name, email: myUser.email, photoURL: myUser.photoURL });
        loginOv.classList.remove('show');
        loginOv.style.opacity = '0';
        setTimeout(() => { loginOv.style.visibility = 'hidden'; }, 300); 
        initApp(); 
    } else {
        myUser = null;
        authLoading.style.display = 'none';
        authContent.style.display = 'block';
        loginOv.classList.add('show');
        loginOv.style.opacity = '1';
        loginOv.style.visibility = 'visible';
        document.getElementById('board-wrap').style.display = 'none';
    }
});

window.toggleAuth = (type) => {
    document.querySelectorAll('#form-login, #form-register, #form-reset').forEach(el => el.style.display = 'none');
    if(type === 'reg') { document.getElementById('form-register').style.display = 'block'; document.getElementById('auth-title').innerText = "Buat Akun Baru"; } 
    else if(type === 'reset') { document.getElementById('form-reset').style.display = 'block'; document.getElementById('auth-title').innerText = "Atur Ulang Sandi"; } 
    else { document.getElementById('form-login').style.display = 'block'; document.getElementById('auth-title').innerText = "ContentBoard Pro"; }
};

window.loginGoogle = () => { signInWithPopup(auth, googleProvider).catch(e => showMsg("Gagal: " + e.message)); };
window.loginEmail = () => {
    const email = document.getElementById('log-email').value.trim(), pass = document.getElementById('log-pass').value.trim();
    if(!email || !pass) return showMsg("Isi email dan kata sandi.");
    const btn = document.querySelector('#form-login .btn-s'); const ori = btn.innerText; btn.innerText = "⏳"; btn.disabled = true;
    signInWithEmailAndPassword(auth, email, pass).catch(e => { btn.innerText = ori; btn.disabled = false; showMsg("Gagal masuk. Periksa kembali data Anda."); });
};

window.registerEmail = async () => {
    const name = document.getElementById('reg-name').value.trim(), email = document.getElementById('reg-email').value.trim(), pass = document.getElementById('reg-pass').value.trim();
    if(!name || !email || !pass) return showMsg("Semua kolom wajib diisi.");
    if(pass.length < 6) return showMsg("Sandi minimal 6 karakter.");
    const btn = document.querySelector('#form-register .btn-s'); const ori = btn.innerText; btn.innerText = "⏳"; btn.disabled = true; window.isRegistering = true;
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(cred.user, { displayName: name });
        await sendEmailVerification(cred.user);
        await signOut(auth);
        window.isRegistering = false;
        showMsg("Sukses! Link verifikasi dikirim ke email Anda. Klik link tersebut sebelum login.", () => toggleAuth('log'));
    } catch(e) {
        window.isRegistering = false; btn.innerText = ori; btn.disabled = false;
        showMsg(e.code === 'auth/email-already-in-use' ? "Email sudah terdaftar." : "Gagal: " + e.message);
    }
};

window.resetPassword = async () => {
    const email = document.getElementById('res-email').value.trim();
    if(!email) return showMsg("Masukkan email Anda.");
    const btn = document.querySelector('#form-reset .btn-s'); const ori = btn.innerText; btn.innerText = "⏳"; btn.disabled = true;
    try {
        await sendPasswordResetEmail(auth, email);
        showMsg(`Link reset dikirim ke <b>${email}</b>.`, () => toggleAuth('log'));
    } catch(e) { showMsg("Gagal: " + e.message); } 
    finally { btn.innerText = ori; btn.disabled = false; }
};

window.showLogoutMenu = () => { showMsg(`Yakin ingin keluar?`, () => signOut(auth).then(()=>window.location.reload())); };
window.changeUsername = async () => {
    const newName = prompt("Nama panggilan baru:", myUser.name);
    if(!newName || newName.trim() === '' || newName === myUser.name) return;
    try {
        await updateProfile(auth.currentUser, { displayName: newName.trim() });
        myUser.name = newName.trim();
        set(ref(db, `public_users/${myUser.id}`), { name: myUser.name, email: myUser.email, photoURL: myUser.photoURL });
        window.updateMyAvatarUI();
        document.getElementById('user-menu-name').textContent = myUser.name;
        showMsg("Nama berhasil diperbarui!");
    } catch(e) { showMsg("Gagal: " + e.message); }
};

window.changeAvatar = async () => {
    const newPhoto = prompt("Paste link foto profil baru Anda (URL gambar):\n\n(Biarkan kosong lalu klik OK jika ingin kembali ke inisial nama)", myUser.photoURL || "");
    if(newPhoto === null) return;
    try {
        const urlToSave = newPhoto.trim();
        await updateProfile(auth.currentUser, { photoURL: urlToSave });
        myUser.photoURL = urlToSave;
        set(ref(db, `public_users/${myUser.id}`), { name: myUser.name, email: myUser.email, photoURL: myUser.photoURL });
        window.updateMyAvatarUI();
        renderBoard(); 
        if(document.getElementById('team-ov').classList.contains('show')) window.renderTeamList();
        showMsg("Foto profil berhasil diperbarui!");
    } catch(e) { showMsg("Gagal: " + e.message); }
};

// ================= SISTEM PROJECT & COLLABORATION =================

function initApp() {
    window.updateMyAvatarUI();
    document.getElementById('user-menu-name').textContent = myUser.name;
    document.getElementById('user-menu-email').textContent = myUser.email;
    
    const urlParams = new URLSearchParams(window.location.search);
    const joinId = urlParams.get('join');
    if (joinId) { joinProject(joinId); }

    unsubscribeWs = onValue(ref(db, `users/${myUser.id}/workspaces`), (snap) => { workspaces = snap.val() ? Object.values(snap.val()) : []; checkAndRenderWs(); });
    unsubscribeSharedWs = onValue(ref(db, `users/${myUser.id}/shared`), (snap) => { sharedWorkspaces = snap.val() ? Object.values(snap.val()) : []; checkAndRenderWs(); });
}

function checkAndRenderWs() {
    renderWsSelector();
    const e = document.getElementById('empty-state'), b = document.getElementById('board-wrap'), t = document.getElementById('brand-tabs'), f = document.getElementById('fab-add');
    if (workspaces.length === 0 && sharedWorkspaces.length === 0) {
        e.style.display = 'flex'; b.style.display = 'none'; t.style.display = 'none'; if(f) f.style.display = 'none';
    } else {
        e.style.display = 'none'; b.style.display = 'flex'; t.style.display = 'flex'; if(f) f.style.display = 'flex';
        const savedWs = localStorage.getItem('cb_active_ws');
        if (workspaces.some(w => w.id === savedWs)) switchWorkspace(savedWs, true);
        else if (sharedWorkspaces.some(w => w.id === savedWs)) switchWorkspace(savedWs, false);
        else { if(workspaces.length > 0) switchWorkspace(workspaces[0].id, true); else switchWorkspace(sharedWorkspaces[0].id, false); }
    }
}

window.leaveShared = (id, e) => {
    e.stopPropagation();
    showMsg("Hapus project ini dari daftar Anda?", () => {
        sharedWorkspaces = sharedWorkspaces.filter(w => w.id !== id);
        set(ref(db, `users/${myUser.id}/shared`), sharedWorkspaces);
        remove(ref(db, `board_members/${id}/${myUser.id}`));
        if (activeWsId === id) {
            if (workspaces.length > 0) switchWorkspace(workspaces[0].id, true);
            else if (sharedWorkspaces.length > 0) switchWorkspace(sharedWorkspaces[0].id, false);
            else { activeWsId = null; checkAndRenderWs(); }
        }
    });
};

function renderWsSelector() {
    const btn = document.getElementById('project-btn'), cont = document.getElementById('proj-list-container'), sharedCont = document.getElementById('shared-proj-list'), sharedHead = document.getElementById('shared-proj-header');
    if (workspaces.length === 0 && sharedWorkspaces.length === 0) { btn.innerHTML = 'Ruang Kosong ▾'; cont.innerHTML = ''; sharedHead.style.display = 'none'; sharedCont.innerHTML = ''; return; }
    let activeData = workspaces.find(w => w.id === activeWsId) || sharedWorkspaces.find(w => w.id === activeWsId);
    if (activeData) btn.innerHTML = `${activeData.name} ▾`;
    cont.innerHTML = workspaces.map((w, i) => `<div class="proj-item ${w.id === activeWsId ? 'active' : ''}" draggable="true" ondragstart="dragWs(event, ${i})" ondragover="allowDrop(event); dragOverWs(event);" ondragleave="dragLeaveWs(event)" ondrop="dropWs(event, ${i})" onclick="switchWorkspace('${w.id}', true)"><div><span class="proj-drag-handle">⠿</span> ${w.name}</div>${w.id === activeWsId ? '<span>✓</span>' : ''}</div>`).join('');
    if(sharedWorkspaces.length > 0) { 
        sharedHead.style.display = 'block'; 
        sharedCont.innerHTML = sharedWorkspaces.map(w => `<div class="proj-item ${w.id === activeWsId ? 'active' : ''}" onclick="switchWorkspace('${w.id}', false)"><div>👥 ${w.name}</div><div style="display:flex; gap:8px; align-items:center;">${w.id === activeWsId ? '<span>✓</span>' : ''}<span class="leave-proj-btn" title="Keluar / Hapus dari daftar" onclick="leaveShared('${w.id}', event)">❌</span></div></div>`).join(''); 
    } else { sharedHead.style.display = 'none'; sharedCont.innerHTML = ''; }
}

let draggedWsIdx = null;
window.dragWs = (e, i) => { e.stopPropagation(); draggedWsIdx = i; e.dataTransfer.setData("text/plain", String(i)); };
window.dragOverWs = (e) => { e.preventDefault(); const t = e.currentTarget, r = t.getBoundingClientRect(); if(e.clientY < r.y + r.height/2) { t.style.borderTop='2px solid var(--primary)'; t.style.borderBottom='2px solid transparent'; } else { t.style.borderBottom='2px solid var(--primary)'; t.style.borderTop='2px solid transparent'; } };
window.dragLeaveWs = (e) => { e.currentTarget.style.borderTop='2px solid transparent'; e.currentTarget.style.borderBottom='2px solid transparent'; };
window.dropWs = (e, targetIdx) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.borderTop='2px solid transparent'; e.currentTarget.style.borderBottom='2px solid transparent'; if (draggedWsIdx === null || draggedWsIdx === targetIdx) return; const w = workspaces.splice(draggedWsIdx, 1)[0], dropBelow = e.clientY > (e.currentTarget.getBoundingClientRect().y + e.currentTarget.getBoundingClientRect().height/2); let insertIdx = targetIdx; if (draggedWsIdx < targetIdx && !dropBelow) insertIdx--; if (draggedWsIdx > targetIdx && dropBelow) insertIdx++; workspaces.splice(insertIdx, 0, w); set(ref(db, `users/${myUser.id}/workspaces`), workspaces); draggedWsIdx = null; };

window.generateShareLink = () => { if(!activeWsId) return; if(!isOwner) return showMsg("Hanya pembuat project yang bisa mengundang orang lain."); update(ref(db, `board_members/${activeWsId}/${myUser.id}`), { role: 'owner' }); const link = `${window.location.origin}${window.location.pathname}?join=${activeWsId}`; navigator.clipboard.writeText(link).then(() => { showMsg(`<b>Link Undangan Disalin!</b><br><br>Kirim link ini ke tim Anda:<br><code style="background:var(--input-bg); padding:4px; border-radius:4px; display:block; margin-top:8px; word-break:break-all; font-size:11px;">${link}</code><br>Mereka wajib login/daftar terlebih dahulu sebelum bisa bergabung.`); }); };

window.joinProject = async (joinId) => { 
    if (!myUser) return; 
    try { 
        try { await set(ref(db, `board_members/${joinId}/${myUser.id}`), { role: 'editor' }); } catch (errSet) {}
        await new Promise(r => setTimeout(r, 500)); 
        const dbPath = joinId === 'default' ? 'content_board_data' : `content_board_data_${joinId}`;
        let projName = "Project Kolaborasi";
        try {
            const snap = await get(ref(db, `${dbPath}/meta`)); 
            if(snap.exists() && snap.val() && snap.val().name) projName = snap.val().name;
            else if (joinId === 'default') projName = "Project Utama";
        } catch(e) { if (joinId === 'default') projName = "Project Utama"; }
        
        const userSharedSnap = await get(ref(db, `users/${myUser.id}/shared`));
        let currentShared = userSharedSnap.val() ? Object.values(userSharedSnap.val()) : [];
        currentShared = currentShared.filter(w => w.id !== joinId);
        const isPersonal = workspaces.find(w => w.id === joinId);
        
        if(!isPersonal) {
            currentShared.push({ id: joinId, name: projName }); 
            await set(ref(db, `users/${myUser.id}/shared`), currentShared); 
            sharedWorkspaces = currentShared; 
        }
        window.history.replaceState({}, document.title, window.location.pathname);
        showMsg("Berhasil bergabung ke project tim!"); 
        switchWorkspace(joinId, false); 
    } catch (e) { 
        window.history.replaceState({}, document.title, window.location.pathname);
        showMsg("Gagal bergabung: " + e.message); 
    } 
};

window.openWsModal = (isEdit = false) => { const titleEl = document.getElementById('ws-title'), inputEl = document.getElementById('ws-name'), delBtn = document.getElementById('ws-del-btn'); if (isEdit) { if(!isOwner) return showMsg("Hanya pemilik yang dapat mengubah nama/menghapus project."); editWsId = activeWsId; titleEl.textContent = "Edit Project"; const w = workspaces.find(w => w.id === activeWsId); inputEl.value = w ? w.name : ''; delBtn.style.display = "block"; } else { editWsId = null; titleEl.textContent = "Project Baru"; inputEl.value = ''; delBtn.style.display = "none"; } document.getElementById('ws-ov').classList.add('show'); };
window.closeWsModal = () => document.getElementById('ws-ov').classList.remove('show');

window.saveWs = () => { const name = document.getElementById('ws-name').value.trim(); if(!name) return; if (editWsId) { const ws = workspaces.find(w => w.id === editWsId); if(ws) ws.name = name; set(ref(db, `users/${myUser.id}/workspaces`), workspaces); set(ref(db, `content_board_data_${editWsId}/meta/name`), name); closeWsModal(); } else { const customId = 'ws_' + Date.now(); workspaces.push({id: customId, name: name}); set(ref(db, `users/${myUser.id}/workspaces`), workspaces); set(ref(db, `content_board_data_${customId}/meta`), { name: name, owner: myUser.id }); set(ref(db, `board_members/${customId}/${myUser.id}`), { role: 'owner' }); closeWsModal(); localStorage.setItem('cb_active_ws', customId); switchWorkspace(customId, true); } };

window.confirmDelWs = () => { showMsg("Hapus project ini beserta seluruh kontennya secara permanen?", () => { workspaces = workspaces.filter(w => w.id !== activeWsId); set(ref(db, `users/${myUser.id}/workspaces`), workspaces); remove(ref(db, `content_board_data_${activeWsId}`)); remove(ref(db, `board_members/${activeWsId}`)); closeWsModal(); if(workspaces.length > 0) switchWorkspace(workspaces[0].id, true); }); };

window.switchWorkspace = (wsId, ownerFlag) => {
    if(unsubscribeBoard) unsubscribeBoard(); 
    activeWsId = wsId; isOwner = ownerFlag;
    localStorage.setItem('cb_active_ws', wsId); 
    aB = 'all';
    document.getElementById('btn-edit-ws').style.display = isOwner ? 'flex' : 'none';
    
    if (isOwner && myUser) {
        update(ref(db, `board_members/${wsId}/${myUser.id}`), { role: 'owner' }).catch(()=>{});
    }

    const handleKick = (err) => {
        if(err.message && err.message.toLowerCase().includes('permission_denied')) {
            showMsg("Akses ditutup. Anda telah dikeluarkan dari project ini.", () => {
                sharedWorkspaces = sharedWorkspaces.filter(w => w.id !== wsId);
                set(ref(db, `users/${myUser.id}/shared`), sharedWorkspaces);
                if(workspaces.length > 0) switchWorkspace(workspaces[0].id, true);
                else { activeWsId = null; checkAndRenderWs(); }
            });
        }
    };

    onValue(ref(db, `board_members/${wsId}`), async (snap) => {
        wsMembers = {};
        if(snap.val()) {
            const memIds = Object.keys(snap.val());
            for(let id of memIds) { const uSnap = await get(ref(db, `public_users/${id}`)); if(uSnap.exists()) wsMembers[id] = { id: id, name: uSnap.val().name, photoURL: uSnap.val().photoURL }; }
        }
        updateAssigneeDropdowns(); renderBoard();
        if(document.getElementById('team-ov').classList.contains('show')) window.renderTeamList();
    }, handleKick);
    
    const dbPath = wsId === 'default' ? 'content_board_data' : `content_board_data_${wsId}`;
    unsubscribeBoard = onValue(ref(db, dbPath), (snapshot) => {
        const data = snapshot.val() || {};
        brands = data.brands || []; cards = data.cards || [];
        columns = (data.columns && data.columns.length > 0) ? data.columns : [{id:'review',lbl:'Review',c:'#534AB7', collapsed: false}];
        creators = data.creators || []; 
        
        if(window.loadLocalTheme) window.loadLocalTheme();
        
        renderAll(); renderWsSelector(); updateCreatorDropdowns();
    }, handleKick);
};

// ================= MANAJEMEN PJ IDE (CREATOR EKSTERNAL) =================
window.openCreatorList = () => { window.renderCreatorList(); document.getElementById('creator-list-ov').classList.add('show'); };
window.closeCreatorList = () => document.getElementById('creator-list-ov').classList.remove('show');

window.renderCreatorList = () => {
    const cont = document.getElementById('creator-list-container');
    if(creators.length === 0) { cont.innerHTML = '<div class="empty" style="padding:16px;">Belum ada nama PJ Ide yang ditambahkan.</div>'; return; }
    cont.innerHTML = creators.map(c => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 4px; border-bottom:1px solid var(--input-border);">
            <div style="font-weight:600; color:var(--text-main); font-size:13px;">
                <span class="pic-avatar-mini" style="display:inline-flex; width:20px; height:20px; font-size:9px; margin-right:6px; vertical-align:middle;">${c.name.charAt(0).toUpperCase()}</span> 
                ${c.name}
            </div>
            <div style="display:flex; gap:6px;">
                <button class="btn-c" style="padding:4px 8px; font-size:11px;" onclick="editCreator('${c.id}')">Edit</button>
                <button class="btn-c" style="padding:4px 8px; font-size:11px; color:#e24b4a; border-color:rgba(226,75,74,0.3); background:rgba(226,75,74,0.05);" onclick="delCreator('${c.id}')">Hapus</button>
            </div>
        </div>
    `).join('');
};

window.addCreator = () => {
    const input = document.getElementById('new-creator-name');
    const name = input.value.trim();
    if(!name) return;
    creators.push({id: 'cr'+Date.now(), name: name});
    input.value = '';
    syncToFirebase();
    window.renderCreatorList();
    updateCreatorDropdowns();
    renderBoard();
};

window.editCreator = (id) => {
    const c = creators.find(x => x.id === id);
    const newName = prompt("Edit Nama PJ Ide:", c.name);
    if(newName && newName.trim()) {
        c.name = newName.trim();
        syncToFirebase();
        window.renderCreatorList();
        updateCreatorDropdowns();
        renderBoard();
        if(selId) selCard(selId);
    }
};

window.delCreator = (id) => {
    showMsg("Hapus PJ Ide ini? (Namanya akan dikosongkan dari konten yang sedang ditanganinya)", () => {
        creators = creators.filter(x => x.id !== id);
        cards.forEach(c => { if(c.creator === id) c.creator = ''; });
        syncToFirebase();
        window.renderCreatorList();
        updateCreatorDropdowns();
        renderBoard();
        if(selId) selCard(selId);
    });
};

function updateCreatorDropdowns() {
    let opts = `<option value="">Belum Ada PJ Ide</option>`;
    let fOpts = `<option value="all">Semua PJ Ide</option><option value="unassigned">Belum Ada PJ</option>`;
    creators.forEach(c => {
        opts += `<option value="${c.id}">${c.name}</option>`;
        fOpts += `<option value="${c.id}">${c.name}</option>`;
    });

    opts += `<option disabled>──────────</option><option value="manage_creator">⚙️ Kelola Nama PJ...</option>`;

    const mCre = document.getElementById('m-creator'); if(mCre) mCre.innerHTML = opts;
    const dpCre = document.getElementById('dp-fcreator'); if(dpCre) dpCre.innerHTML = opts;
    const fCre = document.getElementById('filter-creator'); if(fCre) { const cur = fCre.value; fCre.innerHTML = fOpts; if(fOpts.includes(cur)) fCre.value = cur; }

    if(selId){ 
        const c = cards.find(x=>x.id===selId); 
        if(c && dpCre) dpCre.value = c.creator || '';
    }
}
// ====================================================================

window.openTeamModal = () => { window.renderTeamList(); document.getElementById('team-ov').classList.add('show'); };
window.closeTeamModal = () => document.getElementById('team-ov').classList.remove('show');
window.renderTeamList = () => {
    const container = document.getElementById('team-list'); if(!container) return;
    let html = '';
    for(let id in wsMembers) {
        const isMe = id === myUser.id; const canRemove = isOwner && !isMe;
        const mem = wsMembers[id];
        const avaNode = mem.photoURL ? `<img src="${mem.photoURL}" class="pic-avatar-mini" style="margin:0; border:none; object-fit:cover;" onerror="this.outerHTML='<div class=\\'pic-avatar-mini\\' style=\\'margin:0;\\'>${mem.name.charAt(0).toUpperCase()}</div>'"/>` : `<div class="pic-avatar-mini" style="margin:0;">${mem.name.charAt(0).toUpperCase()}</div>`;
        html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid var(--input-border);">
            <div style="display:flex; align-items:center; gap:10px;">
                ${avaNode}
                <div style="font-weight:600; color:var(--text-main); font-size:13px;">${mem.name} ${isMe ? '<span style="color:var(--primary);">(Anda)</span>' : ''}</div>
            </div>
            ${canRemove ? `<button class="btn-c" style="padding:6px 12px; font-size:11px; color:#e24b4a; border-color:rgba(226,75,74,0.3); background:rgba(226,75,74,0.05);" onclick="removeMember('${id}')">Keluarkan</button>` : ''}
        </div>`;
    }
    container.innerHTML = html || '<div class="empty">Belum ada anggota.</div>';
};

window.removeMember = (id) => { 
    showMsg("Keluarkan anggota ini dari project? (Nama mereka akan dihapus dari semua tugas)", async () => { 
        try {
            if (isOwner) {
                await update(ref(db, `board_members/${activeWsId}/${myUser.id}`), { role: 'owner' });
            }
            await remove(ref(db, `board_members/${activeWsId}/${id}`)); 
            cards.forEach(c => { if(c.assignee === id) c.assignee = ''; }); 
            syncToFirebase(); 
            showMsg("Anggota berhasil dikeluarkan."); 
        } catch(e) {
            showMsg("Gagal mengeluarkan: " + e.message);
        }
    }); 
};

function updateAssigneeDropdowns() {
    let opts = `<option value="">Belum Ada PIC</option>`;
    let fOpts = `<option value="all">Semua PIC Eksekusi</option><option value="unassigned">Belum Ada PIC</option>`;
    for(let id in wsMembers) {
        opts += `<option value="${id}">${wsMembers[id].name}</option>`;
        fOpts += `<option value="${id}">${wsMembers[id].name}</option>`;
    }
    const mAss = document.getElementById('m-assignee'); if(mAss) mAss.innerHTML = opts;
    const dpAss = document.getElementById('dp-fassignee'); if(dpAss) { dpAss.innerHTML = opts; }
    const fAss = document.getElementById('filter-assignee'); if(fAss) { const cur = fAss.value; fAss.innerHTML = fOpts; if(fOpts.includes(cur)) fAss.value = cur; }
    
    if(selId){ 
        const c = cards.find(x=>x.id===selId); 
        if(c && dpAss) dpAss.value = c.assignee || '';
    }
}

let syncDebounce;
window.syncToFirebase = function() { 
    clearTimeout(syncDebounce);
    syncDebounce = setTimeout(() => {
        if(!activeWsId) return; 
        const dbPath = activeWsId === 'default' ? 'content_board_data' : `content_board_data_${activeWsId}`; 
        update(ref(db, dbPath), { brands, cards, columns, creators }); 
    }, 500);
}

function applyTheme() {
    const root = document.documentElement; root.style.setProperty('--primary', themeSettings.color || '#534AB7');
    let lightColor = themeSettings.color || '#534AB7'; if(lightColor.length === 7) lightColor += '20'; 
    root.style.setProperty('--primary-light', lightColor);
    
    const appEl = document.getElementById('main-app'), bgP = document.getElementById('bg-preview');
    if(themeSettings.bg) { 
        appEl.style.backgroundImage = `url('${themeSettings.bg}')`; 
        appEl.style.backgroundPosition = themeSettings.bgPos || '50% 50%';
        if(bgP) {
            bgP.style.backgroundImage = `url('${themeSettings.bg}')`; 
            bgP.style.backgroundPosition = themeSettings.bgPos || '50% 50%';
        }
        if(document.getElementById('btn-repo')) document.getElementById('btn-repo').style.display = 'block';
    } else { 
        appEl.style.backgroundImage = 'none'; 
        if(bgP) bgP.style.backgroundImage = 'none'; 
        if(document.getElementById('btn-repo')) document.getElementById('btn-repo').style.display = 'none';
    }
}

window.saveLocalTheme = () => { localStorage.setItem('cb_theme_' + activeWsId, JSON.stringify(themeSettings)); };
window.loadLocalTheme = () => { const saved = localStorage.getItem('cb_theme_' + activeWsId); themeSettings = saved ? JSON.parse(saved) : { color: '#534AB7', bg: '', bgPos: '50% 50%' }; applyTheme(); };

window.openThemeModal = () => { document.getElementById('theme-ov').classList.add('show'); };
window.closeThemeModal = () => document.getElementById('theme-ov').classList.remove('show');
window.setThemeColor = (c, el) => { themeSettings.color = c; document.querySelectorAll('.theme-option').forEach(x=>x.classList.remove('active')); if(el) el.classList.add('active'); applyTheme(); window.saveLocalTheme(); };
window.removeBg = () => { themeSettings.bg = ''; applyTheme(); window.saveLocalTheme(); document.getElementById('file-bg-input').value = ''; };

// --- REPOSITION WALLPAPER ---
window.startReposition = () => {
    if(!themeSettings.bg) return;
    isRepoMode = true;
    document.getElementById('repo-overlay').style.display = 'flex';
    document.getElementById('theme-ov').classList.remove('show');
};
window.stopReposition = () => {
    isRepoMode = false;
    document.getElementById('repo-overlay').style.display = 'none';
    window.saveLocalTheme();
    document.getElementById('theme-ov').classList.add('show');
};

const repoOverlay = document.getElementById('repo-overlay');
const appEl = document.getElementById('main-app');

repoOverlay.addEventListener('mousedown', e => {
    if(!isRepoMode) return;
    startY = e.clientY;
    let curPos = themeSettings.bgPos ? themeSettings.bgPos.split(' ')[1] : '50%';
    startPos = parseFloat(curPos) || 50;
});
window.addEventListener('mousemove', e => {
    if(!isRepoMode || startY === undefined) return;
    let diff = (e.clientY - startY) * 1.5; 
    let newPos = Math.max(0, Math.min(100, startPos - diff));
    themeSettings.bgPos = `50% ${newPos}%`;
    appEl.style.backgroundPosition = themeSettings.bgPos;
});
window.addEventListener('mouseup', () => { startY = undefined; });

repoOverlay.addEventListener('touchstart', e => {
    if(!isRepoMode) return;
    startY = e.touches[0].clientY;
    let curPos = themeSettings.bgPos ? themeSettings.bgPos.split(' ')[1] : '50%';
    startPos = parseFloat(curPos) || 50;
}, {passive: true});
window.addEventListener('touchmove', e => {
    if(!isRepoMode || startY === undefined) return;
    let diff = (e.touches[0].clientY - startY) * 1.5; 
    let newPos = Math.max(0, Math.min(100, startPos - diff));
    themeSettings.bgPos = `50% ${newPos}%`;
    appEl.style.backgroundPosition = themeSettings.bgPos;
}, {passive: true});
window.addEventListener('touchend', () => { startY = undefined; });

// --- EDITOR GAMBAR LOKAL ---
window.handleBgUpload = (input) => {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (file.size > 5 * 1024 * 1024) {
            showMsg("Ukuran melebihi 5MB. Silakan pilih gambar yang lebih kecil.");
            input.value = ''; return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            if (file.type === 'image/gif') {
                themeSettings.bg = e.target.result;
                themeSettings.bgPos = '50% 50%';
                applyTheme(); window.saveLocalTheme();
                showMsg("GIF Berhasil Terpasang! 🎞️ Gunakan tombol 'Atur Posisi' untuk menggeser.");
                input.value = '';
            } else {
                tempImgObj.onload = function() {
                    imgRotation = 0;
                    updateImgPreview();
                    document.getElementById('img-edit-ov').classList.add('show');
                    document.getElementById('theme-ov').classList.remove('show');
                }
                tempImgObj.src = e.target.result;
                input.value = '';
            }
        };
        reader.readAsDataURL(file);
    }
};

window.rotateImg = () => { imgRotation = (imgRotation + 90) % 360; updateImgPreview(); };

window.updateImgPreview = () => { 
    const canvas = document.getElementById('img-edit-preview-canvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let rw = tempImgObj.width, rh = tempImgObj.height;
    if (imgRotation === 90 || imgRotation === 270) {
        rw = tempImgObj.height; rh = tempImgObj.width;
    }
    
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = rw; rotCanvas.height = rh;
    const rotCtx = rotCanvas.getContext('2d');
    rotCtx.translate(rw/2, rh/2);
    rotCtx.rotate(imgRotation * Math.PI / 180);
    rotCtx.drawImage(tempImgObj, -tempImgObj.width/2, -tempImgObj.height/2);
    
    const targetRatio = 16 / 9;
    const currentRatio = rw / rh;
    let cropW = rw, cropH = rh, cropX = 0, cropY = 0;
    
    if (currentRatio > targetRatio) {
        cropW = rh * targetRatio; cropX = (rw - cropW) / 2;
    } else {
        cropH = rw / targetRatio; cropY = (rh - cropH) / 2;
    }
    
    canvas.width = 800; 
    canvas.height = 800 / targetRatio;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(rotCanvas, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
};

window.cancelImgEdit = () => { document.getElementById('img-edit-ov').classList.remove('show'); document.getElementById('theme-ov').classList.add('show'); };

window.applyEditedImg = () => {
    const finalCanvas = document.createElement('canvas');
    const ctx = finalCanvas.getContext('2d');
    
    let rw = tempImgObj.width, rh = tempImgObj.height;
    if (imgRotation === 90 || imgRotation === 270) {
        rw = tempImgObj.height; rh = tempImgObj.width;
    }
    
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = rw; rotCanvas.height = rh;
    const rotCtx = rotCanvas.getContext('2d');
    rotCtx.translate(rw/2, rh/2);
    rotCtx.rotate(imgRotation * Math.PI / 180);
    rotCtx.drawImage(tempImgObj, -tempImgObj.width/2, -tempImgObj.height/2);
    
    const targetRatio = 16 / 9;
    const currentRatio = rw / rh;
    let cropW = rw, cropH = rh, cropX = 0, cropY = 0;
    
    if (currentRatio > targetRatio) {
        cropW = rh * targetRatio; cropX = (rw - cropW) / 2;
    } else {
        cropH = rw / targetRatio; cropY = (rh - cropH) / 2;
    }
    
    let finalW = cropW;
    const MAX_W = 1920; 
    if (finalW > MAX_W) { finalW = MAX_W; }
    let finalH = finalW / targetRatio;
    
    finalCanvas.width = finalW; 
    finalCanvas.height = finalH;
    
    ctx.drawImage(rotCanvas, cropX, cropY, cropW, cropH, 0, 0, finalW, finalH);
    
    themeSettings.bg = finalCanvas.toDataURL('image/jpeg', 0.8);
    themeSettings.bgPos = '50% 50%';
    applyTheme(); window.saveLocalTheme();
    document.getElementById('img-edit-ov').classList.remove('show');
    document.getElementById('theme-ov').classList.add('show');
};

// ================= FUNGSI PAPAN & KARTU =================
window.openMoveWsModal = (cardId) => { cardToMoveId = cardId; const availableWs = workspaces.filter(w => w.id !== activeWsId); if(availableWs.length === 0) return showMsg("Buat Project lain dulu untuk memindahkan."); document.getElementById('move-ws-select').innerHTML = availableWs.map(w => `<option value="${w.id}">${w.name}</option>`).join(''); document.getElementById('move-ws-ov').classList.add('show'); };
window.closeMoveWsModal = () => { document.getElementById('move-ws-ov').classList.remove('show'); cardToMoveId = null; };
window.moveCardToWs = async () => { const targetWsId = document.getElementById('move-ws-select').value; const cIdx = cards.findIndex(x => x.id === cardToMoveId); if(cIdx === -1) return; const cardToMove = JSON.parse(JSON.stringify(cards[cIdx])); const btn = document.getElementById('move-ws-btn'); try { btn.textContent = 'Memindahkan...'; btn.disabled = true; cards.splice(cIdx, 1); syncToFirebase(); const destPath = targetWsId === 'default' ? 'content_board_data' : `content_board_data_${targetWsId}`; const destSnap = await get(ref(db, destPath)); let destData = destSnap.val() || { cards: [], columns: [], brands: [] }; if(!destData.cards) destData.cards = []; cardToMove.bId = ""; cardToMove.status = (destData.columns && destData.columns.length > 0) ? destData.columns[0].id : 'review'; destData.cards.unshift(cardToMove); await set(ref(db, destPath), destData); closeMoveWsModal(); showMsg("Berhasil dipindahkan!"); renderBoard(); } catch(e) { cards.splice(cIdx, 0, cardToMove); syncToFirebase(); renderBoard(); showMsg("Gagal: " + e.message); } finally { btn.textContent = 'Pindahkan'; btn.disabled = false; } };

window.showCtxMenu = (e, type, id) => { 
    e.preventDefault(); e.stopPropagation(); 
    const ctx = document.getElementById('ctx-menu'); 
    ctx.style.display = 'flex'; 
    if (type === 'col') ctx.innerHTML = `<button class="ctx-item" onclick="openCol('${id}'); hideCtxMenu()">✏️ Edit Status</button><div class="ctx-hr"></div><button class="ctx-item danger" onclick="confirmDelCol('${id}'); hideCtxMenu()">🗑️ Hapus Status</button>`; 
    else if (type === 'brand') ctx.innerHTML = `<button class="ctx-item" onclick="openEditBrand('${id}'); hideCtxMenu()">✏️ Edit Brand</button><div class="ctx-hr"></div><button class="ctx-item danger" onclick="confirmDelBrand('${id}'); hideCtxMenu()">🗑️ Hapus Brand</button>`; 
    else if (type === 'card') {
        selId = id; 
        ctx.innerHTML = `<button class="ctx-item" onclick="selCard('${id}'); hideCtxMenu()">✏️ Edit Konten</button><button class="ctx-item" onclick="dupCard();hideCtxMenu()">📄 Duplikat Konten</button><button class="ctx-item" onclick="openMoveWsModal('${id}'); hideCtxMenu()">📦 Pindah Project</button><div class="ctx-hr"></div><button class="ctx-item danger" onclick="delCurCard();hideCtxMenu()">🗑️ Hapus Konten</button>`; 
    }
    let x = e.clientX, y = e.clientY; 
    if (x + ctx.offsetWidth > window.innerWidth) x = window.innerWidth - ctx.offsetWidth - 10; 
    if (y + ctx.offsetHeight > window.innerHeight) y = window.innerHeight - ctx.offsetHeight - 10; 
    ctx.style.left = x + 'px'; ctx.style.top = y + 'px'; 
};

window.cols = (t) => columns; 
window.renderAll = () => { renderTabs(); renderBoard(); };

let draggedBrandIdx = null;
window.dragB = (e, idx) => { e.stopPropagation(); draggedBrandIdx = idx; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(idx)); };
window.dropB = (e, targetIdx) => { 
    e.preventDefault(); e.stopPropagation(); 
    if(draggedBrandIdx === null || draggedBrandIdx === targetIdx) return; 
    const draggedBrand = brands.splice(draggedBrandIdx, 1)[0];
    brands.splice(targetIdx, 0, draggedBrand); 
    syncToFirebase(); 
    renderTabs(); 
    renderBoard();
    draggedBrandIdx = null; 
};

window.renderTabs = () => { document.getElementById('brand-tabs').innerHTML = `<div class="btab${aB==='all'?' active':''}" onclick="setB('all')">Semua Brand</div>` + brands.map((b, i) => `<div class="btab${aB===b.id?' active':''}" draggable="true" ondragstart="dragB(event, ${i})" ondragover="allowDrop(event)" ondrop="dropB(event, ${i})" onclick="setB('${b.id}')" oncontextmenu="showCtxMenu(event, 'brand', '${b.id}')"><span class="bdot" style="background:${b.c}"></span>${b.n}</div>`).join('') + `<div class="add-btab" onclick="openBrand()" title="Tambah Klien/Brand Baru">+</div>`; const opts = `<option value="">Umum (Tanpa Brand)</option>` + brands.map(b => `<option value="${b.id}">${b.n}</option>`).join(''); const mBrand = document.getElementById('m-brand'); if(mBrand) mBrand.innerHTML = opts; const dpBrand = document.getElementById('dp-fbrand'); if(dpBrand) dpBrand.innerHTML = opts; };

// ================= RENDER BOARD & KARTU =================
window.renderBoard = () => { 
    if (workspaces.length === 0 && sharedWorkspaces.length === 0) return; 
    const sortBy = document.getElementById('sort-by').value; 
    const vis = window.getFilteredCards(); 
    
    // UPDATE ANGKA TOTAL KONTEN
    const totalCapsule = document.getElementById('total-card-display');
    if (totalCapsule) totalCapsule.innerText = 'Total: ' + vis.length;

    const collapsedState = JSON.parse(localStorage.getItem(`cb_collapsed_cols_${activeWsId}`)) || {};

    document.getElementById('board').innerHTML = columns.map((col, idx) => { 
        let cc = vis.filter(c => c.status===col.id); 
        if (sortBy !== 'manual') cc.sort((a, b) => { 
            if (sortBy === 'date-asc') return new Date(a.date||'9999') - new Date(b.date||'9999'); 
            if (sortBy === 'date-desc') return new Date(b.date||'0000') - new Date(a.date||'0000'); 
            if (sortBy === 'newest') {
                const dateA = new Date(a.date || '0000').getTime();
                const dateB = new Date(b.date || '0000').getTime();
                if (dateA !== dateB) return dateB - dateA; 
                return b.id.localeCompare(a.id); 
            }
            return a.type.localeCompare(b.type); 
        }); 
        
        const isCollapsed = collapsedState[col.id] || false;
        
        if(isCollapsed) return `<div class="col collapsed" ondragover="allowDrop(event)" ondrop="dropCard(event, '${col.id}')"><div class="collapsed-head" style="--col-color:${col.c}" draggable="true" ondragstart="dragCol(event, '${col.id}')" ondragend="dragEndCol(event)" ondragover="allowDrop(event); dragOverCol(event, '${col.id}')" ondragleave="dragLeaveCol(event)" ondrop="dropCol(event, '${col.id}')" onclick="toggleCol('${col.id}')" oncontextmenu="showCtxMenu(event, 'col', '${col.id}')"><button class="col-toggle">▶</button><span class="col-lbl-vert">${col.lbl}</span><span class="col-cnt" style="transform:rotate(90deg); margin-top:8px; margin-bottom:12px;">${cc.length}</span></div></div>`; 
        
        return `<div class="col" ondragover="allowDrop(event)" ondrop="dropCard(event, '${col.id}')"><div class="col-head" draggable="true" ondragstart="dragCol(event, '${col.id}')" ondragend="dragEndCol(event)" ondragover="allowDrop(event); dragOverCol(event, '${col.id}')" ondragleave="dragLeaveCol(event)" ondrop="dropCol(event, '${col.id}')" style="border-top:4px solid ${col.c}; cursor:grab;" oncontextmenu="showCtxMenu(event, 'col', '${col.id}')"><span class="col-drag-handle" style="color:var(--text-light); margin-right:4px;">⠿</span><span class="col-lbl">${col.lbl}</span><span class="col-cnt">${cc.length}</span><button class="col-toggle" onclick="event.stopPropagation(); toggleCol('${col.id}')" style="margin-left:auto;">◀</button></div><div class="col-body">${cc.length?cc.map(c=>cardH(c)).join(''):'<div class="empty">Kosong</div>'}</div></div>`; 
    }).join('') + `<div class="col" style="justify-content:center; width:280px;"><button class="add-col-btn" style="height:120px;" onclick="openCol()">+ Tambah Status/Kolom</button></div>`; 
};

window.cardH = (c) => { 
    const b = brands.find(x=>x.id===c.bId) || {n:'', c:'transparent'}, cl = cols(c.type), ci = cl.findIndex(x=>x.id===c.status); 
    let urgBadge = ''; 
    if (c.urgency === 'high') urgBadge = `<span class="tbadge" style="background:#FEECEB;color:#E24B4A;">🔥 Mendesak</span>`; 
    else if (c.urgency === 'med') urgBadge = `<span class="tbadge" style="background:#FEF5E7;color:#BA7517;">⚡ Penting</span>`; 
    else if (c.urgency === 'low') urgBadge = `<span class="tbadge" style="background:#E1F5EE;color:#1D9E75;">🐢 Santai</span>`; 
    
    let objBadge = ''; 
    if (c.type !== 'Catatan' && c.type !== 'To-Do') { 
        const obj = c.objective || 'Konten'; 
        if (obj === 'Ads') objBadge = `<span class="tbadge" style="background:#FFF3CD;color:#D85A30;">📢 Ads</span>`; 
        else if (obj === 'Campaign') objBadge = `<span class="tbadge" style="background:#FCE4EC;color:#D81B60;">🎪 Campaign</span>`; 
        else if (obj === 'Boost') objBadge = `<span class="tbadge" style="background:#E3F2FD;color:#1976D2;">🚀 Boost</span>`; 
    } 
    
    let dateStyle="color:var(--text-light);", alert=""; 
    if (c.type !== 'Catatan' && c.type !== 'To-Do' && c.date && ci < cl.length-1) { 
        const diff = (new Date(c.date+'T'+(c.time||'23:59')) - new Date()) / 36e5; 
        if (diff<0) { dateStyle="color:#e24b4a;font-weight:700;"; alert=`<span style="color:#e24b4a;font-size:10px;margin-left:4px;">⚠️ Overdue</span>`; } 
        else if (diff<=24) { dateStyle="color:#D85A30;font-weight:700;"; alert=`<span style="color:#D85A30;font-size:10px;margin-left:4px;">⏳ H-1</span>`; } 
    } 
    
    const dt = (c.type !== 'Catatan' && c.type !== 'To-Do' && c.date) ? `<div style="display:flex;align-items:center; margin-bottom:10px;">${c.week?`<span style="font-size:10px;background:var(--input-bg);color:var(--text-main);padding:3px 6px;border-radius:4px;margin-right:6px;font-weight:600; border:1px solid var(--input-border);">P${c.week}</span>`:''}<span style="font-size:11px;${dateStyle}">${new Date(c.date).getDate()}/${new Date(c.date).getMonth()+1}</span><span style="font-size:11px;${dateStyle};margin-left:4px;">${c.time||''}</span>${alert}</div>` : ''; 
    const prog = (c.steps && c.steps.length) ? `<div class="c-prog-bg"><div class="c-prog-fill" style="width:${Math.round(c.steps.filter(s=>s.done).length/c.steps.length*100)}%"></div></div><div class="c-prog-text">${c.steps.filter(s=>s.done).length}/${c.steps.length} Sub-task Selesai</div>` : ''; 
    const typeClass = c.type==='Video' ? 'tv' : c.type==='Feed' ? 'tf' : c.type==='Catatan' ? 'tc' : c.type==='To-Do' ? 'tt' : 'ts'; 
    
    let picHtml = ''; 
    if (c.assignee && wsMembers[c.assignee]) { 
        const picUser = wsMembers[c.assignee]; 
        let avaImg = '';
        if (picUser.photoURL) {
            avaImg = `<img src="${picUser.photoURL}" class="pic-avatar-mini" title="PIC: ${picUser.name}" onerror="this.outerHTML='<div class=\\'pic-avatar-mini\\' title=\\'PIC: ${picUser.name}\\'>${picUser.name.charAt(0).toUpperCase()}</div>'">`;
        } else {
            avaImg = `<div class="pic-avatar-mini" title="PIC: ${picUser.name}">${picUser.name.charAt(0).toUpperCase()}</div>`; 
        }
        picHtml = `<div style="display:flex; align-items:center; gap:6px;">${avaImg} <span style="font-size:11px; font-weight:700; color:var(--text-muted);">${picUser.name}</span></div>`;
    } 
    
    return `<div class="card" data-id="${c.id}" draggable="true" ondragstart="dragCard(event,'${c.id}')" ondragend="dragEndCard(event)" ondragover="allowDrop(event); dragOverCard(event,'${c.id}')" ondragleave="dragLeaveCard(event)" ondrop="dropOnCard(event,'${c.id}')" onclick="selCard('${c.id}')" oncontextmenu="showCtxMenu(event,'card','${c.id}')"><div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;"><span class="tbadge ${typeClass}">${c.type}</span>${objBadge}${urgBadge}</div>${dt}<div class="card-title">${c.title}</div>${prog}<div class="card-foot" style="justify-content:space-between;"><div style="display:flex; align-items:center; gap:6px; overflow:hidden;">${c.bId?`<span class="cfoot-dot" style="background:${b.c};width:10px;height:10px;border-radius:50%;flex-shrink:0;"></span>`:''}<span class="cfoot-name" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${b.n || 'Umum'}</span></div>${picHtml}</div></div>`; 
};

window.setB = (id) => { aB=id; renderAll(); };

window.toggleCol = (id) => { 
    if(!activeWsId) return;
    let state = JSON.parse(localStorage.getItem(`cb_collapsed_cols_${activeWsId}`)) || {};
    state[id] = !state[id]; 
    localStorage.setItem(`cb_collapsed_cols_${activeWsId}`, JSON.stringify(state)); 
    renderBoard(); 
};

window.openAdd = (s) => { document.getElementById('add-ov').classList.add('show'); selType('Video'); renderMStatus('Video', s || columns[0].id); document.getElementById('m-date').value = new Date().toISOString().split('T')[0]; document.getElementById('m-title').value = ''; document.getElementById('m-objective').value = 'Konten'; };
window.closeAdd = () => document.getElementById('add-ov').classList.remove('show');
window.selType = (t) => { mType=t; document.querySelectorAll('#add-ov .fi[id^="btn-"]').forEach(x=>x.style.background='transparent'); document.getElementById('btn-' + (t==='To-Do' ? 't' : t[0].toLowerCase())).style.background='var(--primary-light)'; document.getElementById('m-datetime-container').style.display=(t==='Catatan'||t==='To-Do')?'none':'block'; document.getElementById('m-objective').parentElement.style.display=(t==='Catatan'||t==='To-Do')?'none':'flex'; renderMStatus(t,''); };
window.renderMStatus = (t,cur) => { const s=document.getElementById('m-status'); if(s) { s.innerHTML=columns.map(x=>`<option value="${x.id}">${x.lbl}</option>`).join(''); if(cur)s.value=cur; } };

window.saveCard = () => { 
    const t=document.getElementById('m-title').value.trim(); 
    if(!t)return; 
    cards.unshift({ id:'c'+Date.now(), title:t, bId:document.getElementById('m-brand').value, type:mType, date:(mType==='Catatan'||mType==='To-Do')?'':document.getElementById('m-date').value, time:(mType==='Catatan'||mType==='To-Do')?'':document.getElementById('m-time').value, week:(mType==='Catatan'||mType==='To-Do')?'':document.getElementById('m-week').value, urgency:document.getElementById('m-urgency').value, objective:(mType==='Catatan'||mType==='To-Do')?'':document.getElementById('m-objective').value, status:document.getElementById('m-status').value, creator: document.getElementById('m-creator').value, assignee: document.getElementById('m-assignee').value, notes:'',images:[],steps:[] }); 
    closeAdd(); 
    syncToFirebase(); 
    renderBoard(); 
};

window.selCard = (id) => { 
    selId=id; 
    const c=cards.find(x=>x.id===id); 
    if(!c)return; 
    document.getElementById('dp-title').textContent=c.title; 
    document.getElementById('dp-ftitle').value=c.title; 
    document.getElementById('dp-fdate').value=c.date||''; 
    document.getElementById('dp-ftime').value=c.time||''; 
    document.getElementById('dp-fweek').value=c.week||'1'; 
    document.getElementById('dp-ftype').value=c.type; 
    document.getElementById('dp-fbrand').value=c.bId; 
    document.getElementById('dp-furgency').value=c.urgency||'normal'; 
    document.getElementById('dp-fobjective').value=c.objective||'Konten'; 
    
    // UPDATE PIC ROW DI DETAIL
    const member = wsMembers[c.assignee];
    const dpAva = document.getElementById('dp-pic-avatar');
    if (member && member.photoURL) {
        dpAva.innerHTML = `<img src="${member.photoURL}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" onerror="this.outerHTML='${member.name.charAt(0).toUpperCase()}'">`;
    } else {
        dpAva.textContent = member ? member.name.charAt(0).toUpperCase() : '?';
    }
    document.getElementById('dp-fassignee').value=c.assignee||''; 

    // UPDATE PJ IDE ROW DI DETAIL (Dari database terpisah)
    const creatorUser = creators.find(x => x.id === c.creator);
    const dpPjAva = document.getElementById('dp-pj-avatar');
    if (creatorUser) {
        dpPjAva.textContent = creatorUser.name.charAt(0).toUpperCase();
    } else {
        dpPjAva.textContent = '?';
    }
    document.getElementById('dp-fcreator').value=c.creator||''; 
    
    document.getElementById('dp-datetime-container').style.display=(c.type==='Catatan'||c.type==='To-Do')?'none':'block'; 
    document.getElementById('dp-obj-container').style.display=(c.type==='Catatan'||c.type==='To-Do')?'none':'flex'; 
    const s=document.getElementById('dp-fstatus'); 
    if(s) { s.innerHTML=columns.map(x=>`<option value="${x.id}">${x.lbl}</option>`).join(''); s.value=c.status; }
    document.getElementById('dp-notes').value=c.notes||''; 
    document.getElementById('dp-notes-display').innerHTML=c.notes?linkify(c.notes):'Klik tambah catatan...'; 
    renderSteps(c); renderAtt(c.images); 
    document.getElementById('dp').classList.add('open'); 
    document.getElementById('dp-ov').classList.add('show'); 
};

window.closeDP = () => { selId=null; document.getElementById('dp').classList.remove('open'); document.getElementById('dp-ov').classList.remove('show'); };

window.dps = (f,v) => { 
    const c=cards.find(x=>x.id===selId); 
    if(c){
        c[f]=v; 
        syncToFirebase(); 
        renderBoard();
        if(f==='assignee' || f==='creator') {
            selCard(selId);
        }
    } 
};

window.dpChType = (v) => { const c=cards.find(x=>x.id===selId); if(c){c.type=v; if(v==='Catatan' || v==='To-Do'){c.date='';c.time='';c.week=''; c.objective='';} syncToFirebase(); selCard(selId);} };
window.dupCard = () => { const c = cards.find(x=>x.id===selId); if(!c) return; const newC = JSON.parse(JSON.stringify(c)); newC.id = 'c'+Date.now(); newC.title += " (Copy)"; cards.unshift(newC); closeDP(); syncToFirebase(); renderBoard(); };
window.delCurCard = () => { if(!selId) return; showMsg("Hapus konten ini secara permanen?",()=>{cards=cards.filter(x=>x.id!==selId); closeDP(); syncToFirebase(); renderBoard(); }); };
window.linkify = (t) => t.replace(/(https?:\/\/[^\s]+)/g,u=>`<a href="${u}" target="_blank" style="color:var(--primary);font-weight:600;">${u}</a>`);
window.editNotes = () => { document.getElementById('dp-notes-display').style.display='none'; const ta=document.getElementById('dp-notes'); ta.style.display='block'; ta.focus(); };
window.saveNotes = (v) => { dps('notes',v); document.getElementById('dp-notes-display').innerHTML=v?linkify(v):'Klik tambah catatan...'; document.getElementById('dp-notes-display').style.display='block'; document.getElementById('dp-notes').style.display='none'; };

window.renderSteps = (c) => { document.getElementById('dp-steps-list').innerHTML = (c.steps||[]).map((s,i)=>`<div class="step-item" draggable="true" ondragstart="dragStep(event, ${i})" ondragend="dragEndStep(event)" ondragover="allowDrop(event); dragOverStep(event);" ondragleave="dragLeaveStep(event)" ondrop="dropStep(event, ${i})"><span class="drag-handle">⠿</span><input type="checkbox" ${s.done?'checked':''} onchange="toggleStep(${i})"><input class="step-input" type="text" value="${s.text.replace(/"/g, '&quot;')}" onblur="updateStepText(${i}, this.value)" style="${s.done?'text-decoration:line-through;color:var(--text-light);':''}"><button class="step-del" onclick="delStep(${i})">×</button></div>`).join(''); };
window.updateStepText = (i, v) => { const c = cards.find(x => x.id === selId); if(c && v.trim()){ c.steps[i].text = v.trim(); syncToFirebase(); } else if(c) renderSteps(c); };
window.toggleStep = (i) => { const c=cards.find(x=>x.id===selId); c.steps[i].done=!c.steps[i].done; syncToFirebase(); renderSteps(c); renderBoard(); };
window.addStep = () => { const i=document.getElementById('new-step-input'); if(!i.value.trim())return; const c=cards.find(x=>x.id===selId); if(!c.steps)c.steps=[]; c.steps.push({text:i.value.trim(),done:false}); i.value=''; syncToFirebase(); renderSteps(c); renderBoard(); };
window.delStep = (i) => { const c=cards.find(x=>x.id===selId); c.steps.splice(i,1); syncToFirebase(); renderSteps(c); renderBoard(); };

let draggedStepIdx = null;
window.dragStep = (e, i) => { e.stopPropagation(); draggedStepIdx = i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); setTimeout(() => { e.target.style.opacity = '0.4'; }, 0); };
window.dragEndStep = (e) => { e.target.style.opacity = '1'; draggedStepIdx = null; document.querySelectorAll('.step-item').forEach(el => el.style.boxShadow = ''); };
window.dragOverStep = (e) => { e.preventDefault(); e.stopPropagation(); if(draggedStepIdx === null) return; const el = e.target.closest('.step-item'); if(!el) return; if (e.clientY - (el.getBoundingClientRect().y + el.getBoundingClientRect().height/2) > 0) el.style.boxShadow = '0 2px 0 var(--primary)'; else el.style.boxShadow = '0 -2px 0 var(--primary)'; };
window.dragLeaveStep = (e) => { const el = e.target.closest('.step-item'); if(el) el.style.boxShadow = ''; };
window.dropStep = (e, t) => { e.preventDefault(); e.stopPropagation(); document.querySelectorAll('.step-item').forEach(el => el.style.boxShadow = ''); if (draggedStepIdx === null || draggedStepIdx === t) return; const c = cards.find(x => x.id === selId); if (!c) return; const dropBelow = e.clientY - (e.target.closest('.step-item').getBoundingClientRect().y + e.target.closest('.step-item').getBoundingClientRect().height/2) > 0; const step = c.steps.splice(draggedStepIdx, 1)[0]; let nt = t; if (draggedStepIdx < t) nt--; if (dropBelow) nt++; c.steps.splice(nt, 0, step); draggedStepIdx = null; syncToFirebase(); renderSteps(c); };

window.addImageUrl = () => { const url = prompt("Paste link gambar di sini (contoh dari Pinterest, Google Drive, atau Web):"); if (url && url.trim() !== '' && selId) { const c = cards.find(x => x.id === selId); if (!c.images) c.images = []; c.images.push(url.trim()); syncToFirebase(); renderAtt(c.images); } };
window.renderAtt = (imgs) => { document.getElementById('dp-attachments').innerHTML=(imgs||[]).map((u,i)=>`<div class="att-item"><img src="${u}" onclick="window.open('${u}','_blank')" onerror="this.src='https://via.placeholder.com/60?text=Gagal+Dimuat'"><button class="att-del" onclick="event.stopPropagation();delImg(${i})">×</button></div>`).join(''); };
window.delImg = (i) => { const c=cards.find(x=>x.id===selId); c.images.splice(i,1); syncToFirebase(); renderAtt(c.images); };

window.openBrand = () => { editBrandId=null; document.getElementById('bm-name').value=''; bCol='#534AB7'; document.getElementById('bm-color-wheel').value=bCol; document.getElementById('bm-color-hex').value=bCol; document.getElementById('brand-ov').classList.add('show'); };
window.openEditBrand = (id) => { const b=brands.find(x=>x.id===id); editBrandId=id; document.getElementById('bm-name').value=b.n; bCol=b.c||'#534AB7'; document.getElementById('bm-color-wheel').value=bCol; document.getElementById('bm-color-hex').value=bCol; document.getElementById('brand-ov').classList.add('show'); };
window.saveBrand = () => { const n=document.getElementById('bm-name').value.trim(); if(!n)return; if(editBrandId){ const b=brands.find(x=>x.id===editBrandId); b.n=n; b.c=bCol; } else { brands.push({id:'b'+Date.now(),n,c:bCol}); } document.getElementById('brand-ov').classList.remove('show'); syncToFirebase(); renderAll(); };
window.confirmDelBrand = (id) => { showMsg("Hapus brand ini?",()=>{brands=brands.filter(x=>x.id!==id); syncToFirebase(); renderAll();}); };
window.closeBrand = () => document.getElementById('brand-ov').classList.remove('show');

window.openCol = (id) => { editColId=id; if(id){ const c=columns.find(x=>x.id===id); document.getElementById('cm-name').value=c.lbl; cCol=c.c||'#534AB7'; } else { document.getElementById('cm-name').value=''; cCol='#534AB7'; } document.getElementById('cm-color-wheel').value=cCol; document.getElementById('cm-color-hex').value=cCol; document.getElementById('col-ov').classList.add('show'); };
window.closeCol = () => document.getElementById('col-ov').classList.remove('show');
window.saveCol = () => { const n=document.getElementById('cm-name').value.trim(); if(!n)return; if(editColId){ const c=columns.find(x=>x.id===editColId); c.lbl=n; c.c=cCol; } else { columns.push({id:'col'+Date.now(),lbl:n,c:cCol,collapsed:false}); } document.getElementById('col-ov').classList.remove('show'); renderAll(); syncToFirebase(); };
window.confirmDelCol = (id) => { if(columns.length<=1)return showMsg("Harus ada minimal 1 status."); showMsg("Hapus kolom status ini?",()=>{const f=columns.find(x=>x.id!==id).id; cards.forEach(c=>{if(c.status===id)c.status=f;}); columns=columns.filter(x=>x.id!==id); renderAll(); syncToFirebase();}); };

// DESKTOP DRAG & DROP HTML5
let draggedCardId = null;
window.dragCard = (e, id) => { e.stopPropagation(); draggedCardId = id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(id)); setTimeout(() => { e.target.style.opacity = '0.5'; }, 0); };
window.dragEndCard = (e) => { e.target.style.opacity = '1'; draggedCardId = null; document.querySelectorAll('.card').forEach(c => c.style.boxShadow = ''); };
window.dragOverCard = (e, id) => { e.preventDefault(); e.stopPropagation(); if(!draggedCardId || draggedCardId === id) return; const t = e.currentTarget; if (e.clientY - (t.getBoundingClientRect().y + t.getBoundingClientRect().height/2) > 0) t.style.boxShadow = '0 4px 0 var(--primary)'; else t.style.boxShadow = '0 -4px 0 var(--primary)'; };
window.dragLeaveCard = (e) => { if(e.currentTarget) e.currentTarget.style.boxShadow = ''; };
window.dropOnCard = (e, targetId) => { 
    e.preventDefault(); e.stopPropagation(); document.querySelectorAll('.card').forEach(c => c.style.boxShadow = ''); 
    if (!draggedCardId || draggedCardId === targetId) return; 
    const cIdx = cards.findIndex(x => x.id === draggedCardId), tIdx = cards.findIndex(x => x.id === targetId); 
    if (cIdx === -1 || tIdx === -1) return; 
    const dropBelow = e.clientY - (e.currentTarget.getBoundingClientRect().y + e.currentTarget.getBoundingClientRect().height/2) > 0; 
    const card = cards.splice(cIdx, 1)[0]; 
    card.status = cards[tIdx].status; 
    let newIdx = cards.findIndex(x => x.id === targetId); 
    if (dropBelow) newIdx++; 
    cards.splice(newIdx, 0, card); 
    document.getElementById('sort-by').value = 'manual'; 
    draggedCardId = null; 
    renderBoard();
    syncToFirebase(); 
};
window.dropCard = (e, colId) => { 
    e.preventDefault(); e.stopPropagation(); 
    const id = e.dataTransfer.getData("text/plain") || draggedCardId; 
    if(!id) return; 
    const cIdx = cards.findIndex(x => x.id === id); 
    if(cIdx > -1) { 
        const card = cards.splice(cIdx, 1)[0]; 
        card.status = colId; 
        cards.push(card); 
        document.getElementById('sort-by').value = 'manual'; 
        renderBoard();
        syncToFirebase(); 
    } 
    draggedCardId = null; 
};

let draggedColId = null;
window.dragCol = (e, id) => { e.stopPropagation(); draggedColId = id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); setTimeout(() => { const col = e.target.closest('.col'); if(col) col.style.opacity = '0.5'; }, 0); };
window.dragEndCol = (e) => { const col = e.target.closest('.col'); if(col) col.style.opacity = '1'; draggedColId = null; document.querySelectorAll('.col').forEach(c => c.style.borderLeft = ''); };
window.dragOverCol = (e, id) => { e.preventDefault(); e.stopPropagation(); if (!draggedColId || draggedColId === id) return; const t = e.currentTarget.closest('.col'); if(t) t.style.borderLeft = '4px solid var(--primary)'; };
window.dragLeaveCol = (e) => { const t = e.currentTarget.closest('.col'); if(t) t.style.borderLeft = ''; };
window.dropCol = (e, targetId) => { 
    e.preventDefault(); e.stopPropagation(); 
    document.querySelectorAll('.col').forEach(c => c.style.borderLeft = ''); 
    if (!draggedColId) { window.dropCard(e, targetId); return; } 
    if (draggedColId === targetId) return; 
    const cIdx = columns.findIndex(x => x.id === draggedColId), tIdx = columns.findIndex(x => x.id === targetId); 
    if (cIdx === -1 || tIdx === -1) return; 
    const col = columns.splice(cIdx, 1)[0]; 
    columns.splice(tIdx, 0, col); 
    draggedColId = null; 
    syncToFirebase(); 
    renderBoard(); 
};

// DRAG DROP MOBILE (Hold 0.4 Detik)
let touchDragCard = null, touchDragClone = null, touchStartX = 0, touchStartY = 0;
let touchDragTimer = null;
let isLongPressed = false;

document.addEventListener('touchstart', (e) => {
    const card = e.target.closest('.card');
    if(!card) return;
    if(['INPUT','BUTTON','TEXTAREA','SELECT','A'].includes(e.target.tagName)) return;
    
    touchDragCard = card;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isLongPressed = false;

    touchDragTimer = setTimeout(() => {
        isLongPressed = true;
        if(touchDragCard) {
            touchDragCard.style.transform = 'scale(1.03)';
            touchDragCard.style.transition = 'transform 0.2s';
            if(navigator.vibrate) navigator.vibrate(50);
        }
    }, 400); 
}, {passive: true});

document.addEventListener('touchmove', (e) => {
    if(!touchDragCard) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    
    if(!isLongPressed) {
        if(Math.abs(dx) > 10 || Math.abs(dy) > 10) {
            clearTimeout(touchDragTimer);
            touchDragCard = null;
        }
        return;
    }

    e.preventDefault(); 

    if(!touchDragClone) {
        const dragAttr = touchDragCard.getAttribute('ondragstart');
        if(dragAttr) draggedCardId = dragAttr.match(/'([^']+)'/)[1];
        
        touchDragCard.style.transform = '';
        touchDragCard.style.transition = '';
        
        touchDragClone = touchDragCard.cloneNode(true);
        touchDragClone.style.position = 'fixed';
        touchDragClone.style.zIndex = '9999';
        touchDragClone.style.opacity = '0.9';
        touchDragClone.style.pointerEvents = 'none'; 
        touchDragClone.style.width = touchDragCard.offsetWidth + 'px';
        touchDragClone.style.boxShadow = '0 15px 30px rgba(0,0,0,0.2)';
        document.body.appendChild(touchDragClone);
        touchDragCard.style.opacity = '0.3';
    }

    if(touchDragClone) {
        touchDragClone.style.left = (touch.clientX - touchDragClone.offsetWidth/2) + 'px';
        touchDragClone.style.top = (touch.clientY - touchDragClone.offsetHeight/2) + 'px';
        
        document.querySelectorAll('.col').forEach(c => c.style.borderLeft = '');
        const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
        const col = dropTarget ? dropTarget.closest('.col') : null;
        if(col && !col.classList.contains('collapsed')) {
            col.style.borderLeft = '4px solid var(--primary)';
        }
    }
}, {passive: false});

document.addEventListener('touchend', (e) => {
    clearTimeout(touchDragTimer);
    
    if(touchDragCard && !touchDragClone && isLongPressed) {
        touchDragCard.style.transform = '';
        touchDragCard.style.transition = '';
    }

    if(touchDragClone) {
        const touch = e.changedTouches[0];
        touchDragClone.remove();
        touchDragClone = null;
        if(touchDragCard) touchDragCard.style.opacity = '1';
        
        const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
        const col = dropTarget ? dropTarget.closest('.col') : null;
        
        if(col && draggedCardId) {
            const dropAttr = col.getAttribute('ondrop');
            if(dropAttr) {
                const colId = dropAttr.match(/'([^']+)'/)[1];
                const cIdx = cards.findIndex(x => x.id === draggedCardId);
                if(cIdx > -1) { 
                    const card = cards.splice(cIdx, 1)[0]; 
                    card.status = colId; 
                    cards.push(card); 
                    document.getElementById('sort-by').value = 'manual'; 
                    renderBoard(); 
                    syncToFirebase(); 
                }
            }
        }
        document.querySelectorAll('.col').forEach(c => c.style.borderLeft = '');
        draggedCardId = null;
    }
    touchDragCard = null;
    isLongPressed = false;
});

window.exportToPDF=()=>{ try { const {jsPDF}=window.jspdf; const doc=new jsPDF(); doc.setFontSize(16); doc.text("ContentPlan - Pro", 14, 20); doc.setFontSize(10); doc.text(`Dicetak pada: ${new Date().toLocaleDateString('id-ID')}`, 14, 28); const visCards = window.getFilteredCards(); const data=visCards.map(c=>[ c.title, brands.find(b=>b.id===c.bId)?.n||'-', c.type, (c.objective || '-'), columns.find(x=>x.id === c.status)?.lbl || c.status, (c.date ? new Date(c.date).toLocaleDateString('id-ID') : '-') ]); doc.autoTable({ head:[['Judul Konten','Brand','Jenis','Jalur','Status', 'Jadwal']], body:data, startY:35, theme: 'grid', headStyles: { fillColor: [83, 74, 183] } }); doc.save("Content_Plan.pdf"); } catch(err) { showMsg("Gagal membuat PDF."); } };

window.syncColor = (v, idS, p='bm') => { if(p==='bm') bCol=v; else cCol=v; const el = document.getElementById(p + '-color-' + idS); if(el) el.value = v; };

let dpTx = 0, dpTy = 0; const dpEl = document.getElementById('dp'), dpBody = document.querySelector('.dp-body');
dpEl.addEventListener('touchstart', e => { dpTx = e.changedTouches[0].screenX; dpTy = e.changedTouches[0].screenY; }, {passive: true});
dpEl.addEventListener('touchend', e => { let dx = e.changedTouches[0].screenX - dpTx, dy = e.changedTouches[0].screenY - dpTy; if (dx > 80 && Math.abs(dy) < 100) closeDP(); if (dy > 80 && Math.abs(dx) < 100 && dpBody.scrollTop <= 10) closeDP(); });

// --- SETUP PWA INSTAN ---
const setupPWA = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#534AB7';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 300px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C', 256, 280);
    const iconBase64 = canvas.toDataURL('image/png');
    
    let appleIcon = document.getElementById('pwa-apple-icon');
    if (!appleIcon) {
        appleIcon = document.createElement('link');
        appleIcon.rel = 'apple-touch-icon';
        appleIcon.id = 'pwa-apple-icon';
        document.head.appendChild(appleIcon);
    }
    appleIcon.href = iconBase64;
    
    const manifest = {
        name: "ContentBoard Pro",
        short_name: "CB Pro",
        start_url: window.location.pathname,
        display: "standalone",
        background_color: "#f5f5f3",
        theme_color: "#534AB7",
        icons: [{ src: iconBase64, sizes: "512x512", type: "image/png" }]
    };
    const manifestStr = JSON.stringify(manifest);
    
    let manifestLink = document.getElementById('pwa-manifest');
    if (!manifestLink) {
        manifestLink = document.createElement('link');
        manifestLink.rel = 'manifest';
        manifestLink.id = 'pwa-manifest';
        document.head.appendChild(manifestLink);
    }
    manifestLink.href = 'data:application/manifest+json;charset=utf-8,' + encodeURIComponent(manifestStr);
};
setupPWA();

window.addToGCal = () => { const c = cards.find(x => x.id === selId); if(!c) return; const b = brands.find(x=>x.id===c.bId); const bName = b ? b.n : 'Umum'; const title = encodeURIComponent(`[${bName}] ${c.title}`), details = encodeURIComponent(`Jenis: ${c.type}\nJalur: ${c.objective || 'Organik'}\nPrioritas: ${c.urgency || 'Normal'}\n\nCatatan:\n${c.notes||''}`); let dates = ""; if (c.date) { const d = new Date(`${c.date}T${c.time||'09:00'}:00`), d2 = new Date(d.getTime() + 36e5), f = x => x.toISOString().replace(/-|:|\.\d\d\d/g, ''); dates = `&dates=${f(d)}/${f(d2)}`; } window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}${dates}`, '_blank'); };

