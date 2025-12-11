let SQL;
let db;

async function initDB() {
	SQL = await initSqlJs({ locateFile: file => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm' });
	const saved = localStorage.getItem('studyme_db');
	if (saved) {
		const u8 = Uint8Array.from(atob(saved), c => c.charCodeAt(0));
		db = new SQL.Database(u8);
	} else {
		db = new SQL.Database();
		createSchema();
	}
	renderBoards();
	renderPlaylists();
	renderQuestions();
}

function createSchema() {
	const stm = `
	CREATE TABLE IF NOT EXISTS boards(id INTEGER PRIMARY KEY, name TEXT);
	CREATE TABLE IF NOT EXISTS subjects(id INTEGER PRIMARY KEY, board_id INTEGER, name TEXT);
	CREATE TABLE IF NOT EXISTS chapters(id INTEGER PRIMARY KEY, subject_id INTEGER, name TEXT);
	CREATE TABLE IF NOT EXISTS questions(id INTEGER PRIMARY KEY, board_id INTEGER, subject_id INTEGER, chapter_id INTEGER, marks INTEGER, year INTEGER, text TEXT, tags TEXT);
	CREATE TABLE IF NOT EXISTS playlists(id INTEGER PRIMARY KEY, name TEXT);
	CREATE TABLE IF NOT EXISTS playlist_items(id INTEGER PRIMARY KEY, playlist_id INTEGER, question_id INTEGER);
	`;
	db.run(stm);
}

function saveDBToLocalStorage() {
	const data = db.export();
	const b64 = btoa(String.fromCharCode(...data));
	localStorage.setItem('studyme_db', b64);
}

function runQuery(sql, params = []) {
	try {
		const res = db.exec(sql, params);
		return res;
	} catch (e) {
		console.error('SQL error', e, sql, params);
		return [];
	}
}

function createBoard(name) {
	db.run('INSERT INTO boards(name) VALUES(?)', [name]);
	saveDBToLocalStorage();
	renderBoards();
}

function renderBoards() {
	const el = document.getElementById('boards');
	el.innerHTML = '';
	const res = runQuery('SELECT id, name FROM boards ORDER BY id DESC');
	if (res.length) {
		const rows = res[0];
		for (let i = 0; i < rows.values.length; i++) {
			const [id, name] = rows.values[i];
			const btn = document.createElement('button');
			btn.textContent = name;
			btn.className = 'w-full text-left p-2 rounded hover:bg-slate-50';
			btn.onclick = () => renderBoardPage(id);
			el.appendChild(btn);
		}
	} else {
		el.innerHTML = '<div class="text-sm text-slate-500">No boards yet</div>';
	}
}

let currentBoardId = null;

function selectBoard(id) {
	currentBoardId = id;
	renderBoardPage(id);
}

function renderDashboard() {
	// show dashboardRoot, hide questionsRoot
	document.getElementById('dashboardRoot').classList.remove('hidden');
	document.getElementById('questionsRoot').classList.add('hidden');
	// populate boards as channel cards
	const boardsWrap = document.getElementById('dashboardBoards');
	boardsWrap.innerHTML = '';
	const res = runQuery('SELECT id, name FROM boards ORDER BY id DESC');
	if (res.length && res[0].values.length) {
		for (const r of res[0].values) {
			const [id, name] = r;
			const card = document.createElement('div');
			card.className = 'channel-card p-3';
			card.innerHTML = `<div class="channel-cover" style="background-image:linear-gradient(180deg, rgba(99,102,241,0.08), rgba(99,102,241,0.02)), url('https://picsum.photos/seed/board${id}/800/400')"></div><div class="mt-3"><div class="channel-title">${escapeHtml(name)}</div><div class="text-sm text-slate-500">Channel for ${escapeHtml(name)} board</div></div>`;
			card.onclick = () => renderBoardPage(id);
			boardsWrap.appendChild(card);
		}
	} else {
		boardsWrap.innerHTML = '<div class="text-sm text-slate-500">No boards yet — create one.</div>';
	}

	// featured playlists
	const pf = document.getElementById('dashboardPlaylists');
	pf.innerHTML = '';
	const pres = runQuery('SELECT id,name FROM playlists ORDER BY id DESC LIMIT 8');
	if (pres.length && pres[0].values.length) {
		const scroll = document.createElement('div');
		scroll.className = 'horizontal-scroll mt-2';
		for (const p of pres[0].values) {
			const [pid, pname] = p;
			const thumb = document.createElement('div');
			thumb.className = 'playlist-thumb';
			thumb.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.02)), url(https://picsum.photos/seed/playlist${pid}/400/240)`;
			const meta = document.createElement('div');
			meta.className = 'mt-2';
			meta.innerHTML = `<div class="font-medium">${escapeHtml(pname)}</div><div class="text-sm text-slate-500">Playlist</div>`;
			const wrap = document.createElement('div');
			wrap.appendChild(thumb);
			wrap.appendChild(meta);
			wrap.className = 'w-56';
			wrap.onclick = () => { document.getElementById('dashboardRoot').classList.add('hidden'); document.getElementById('questionsRoot').classList.remove('hidden'); showPlaylistContents(pid, document.getElementById('generated')); };
			scroll.appendChild(wrap);
		}
		pf.appendChild(scroll);
	} else {
		pf.innerHTML = '<div class="text-sm text-slate-500">No playlists yet</div>';
	}
}

function renderBoardPage(boardId) {
	currentBoardId = boardId;
	// hide dashboard, show questionsRoot
	document.getElementById('dashboardRoot').classList.add('hidden');
	document.getElementById('questionsRoot').classList.remove('hidden');
	// render header
	const headerHtml = document.createElement('div');
	const bres = runQuery('SELECT name FROM boards WHERE id=?', [boardId]);
	const bname = (bres.length && bres[0].values[0][0]) || 'Board';
	headerHtml.innerHTML = `<div class="mb-4"><div class="text-2xl font-semibold">${escapeHtml(bname)}</div><div class="text-sm text-slate-500">Channel page — playlists and questions for ${escapeHtml(bname)}</div></div>`;
	const contentArea = document.getElementById('contentArea');
	// replace or prepend header
	const existingHeader = document.getElementById('boardHeader');
	if (existingHeader) existingHeader.remove();
	headerHtml.id = 'boardHeader';
	contentArea.prepend(headerHtml);
	renderQuestions();
	// render playlists for this board as horizontal thumbnails in right column (playlists section already exists)
}

function renderQuestions() {
	const el = document.getElementById('questionList');
	el.innerHTML = '';
	let sql = 'SELECT q.id, q.text, q.marks, q.year, b.name as board, s.name as subject, c.name as chapter FROM questions q LEFT JOIN boards b ON q.board_id=b.id LEFT JOIN subjects s ON q.subject_id=s.id LEFT JOIN chapters c ON q.chapter_id=c.id';
	const params = [];
	if (currentBoardId) {
		sql += ' WHERE q.board_id=?';
		params.push(currentBoardId);
	}
	sql += ' ORDER BY q.id DESC';
	const res = runQuery(sql, params);
	if (!res.length) return;
	const rows = res[0];
	for (let i = 0; i < rows.values.length; i++) {
		const [id, text, marks, year, board, subject, chapter] = rows.values[i];
		const div = document.createElement('div');
		div.className = 'p-3 bg-slate-50 rounded question-card';
		// compute occurrences (simple exact-match count)
		const occRes = runQuery('SELECT COUNT(*) FROM questions WHERE text = ?', [text]);
		const occ = (occRes.length && occRes[0].values[0][0]) || 1;
		div.innerHTML = `<div class="flex justify-between"><div class="text-sm font-medium">${board || ''} — ${marks} marks</div><div class="text-xs text-slate-500">${year || ''}</div></div><div class="mt-2 text-sm">${escapeHtml(text)}</div>`;
		const badges = document.createElement('div');
		badges.className = 'meta-badges';
		if (board) { const b = document.createElement('div'); b.className='badge'; b.textContent = board; badges.appendChild(b); }
		if (subject) { const b = document.createElement('div'); b.className='badge alt'; b.textContent = subject; badges.appendChild(b); }
		if (chapter) { const b = document.createElement('div'); b.className='badge gray'; b.textContent = chapter; badges.appendChild(b); }
		if (year) { const b = document.createElement('div'); b.className='badge'; b.textContent = year; badges.appendChild(b); }
		const occB = document.createElement('div'); occB.className='badge warn'; occB.textContent = occ + '×'; badges.appendChild(occB);
		div.appendChild(badges);
		const controlWrap = document.createElement('div'); controlWrap.className='mt-2 flex gap-2';
		controlWrap.innerHTML = `<button class="px-2 py-1 bg-indigo-600 text-white rounded" data-id="${id}">Add to playlist</button>`;
		div.appendChild(controlWrap);
		el.appendChild(div);
		const btn = div.querySelector('button');
		btn.onclick = () => showPlaylistPicker(id, btn);
	}
}

function escapeHtml(s) { return (s+'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function showPlaylistPicker(questionId, anchor) {
	const popup = document.createElement('div');
	popup.className = 'absolute bg-white border rounded shadow p-2 z-50';
	popup.style.minWidth = '200px';
	const res = runQuery('SELECT id, name FROM playlists ORDER BY id DESC');
	if (res.length && res[0].values.length) {
		for (const row of res[0].values) {
			const [pid, name] = row;
			const b = document.createElement('button');
			b.className = 'w-full text-left p-1 hover:bg-slate-100';
			b.textContent = name;
			b.onclick = () => { db.run('INSERT INTO playlist_items(playlist_id, question_id) VALUES(?,?)', [pid, questionId]); saveDBToLocalStorage(); document.body.removeChild(popup); };
			popup.appendChild(b);
		}
	} else {
		popup.textContent = 'No playlists — create one first';
	}
	document.body.appendChild(popup);
	const r = anchor.getBoundingClientRect();
	popup.style.left = `${r.left}px`;
	popup.style.top = `${r.bottom + window.scrollY + 4}px`;
	function onDocClick(e) { if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', onDocClick); } }
	setTimeout(()=>document.addEventListener('click', onDocClick), 10);
}

function addQuickQuestions(text) {
	const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
	for (const line of lines) {
		// expected: marks|subject|chapter|year|text
		const parts = line.split('|').map(p=>p.trim());
		const marks = parseInt(parts[0]) || 3;
		const subject = parts[1] || 'General';
		const chapter = parts[2] || 'General';
		const year = parseInt(parts[3]) || null;
		const qtext = parts.slice(4).join(' | ') || parts[parts.length-1] || line;
		const boardId = currentBoardId || null;
		let subjectId = null;
		if (boardId) {
			const sres = runQuery('SELECT id FROM subjects WHERE board_id=? AND name=?', [boardId, subject]);
			if (sres.length && sres[0].values.length) subjectId = sres[0].values[0][0];
			else { db.run('INSERT INTO subjects(board_id,name) VALUES(?,?)', [boardId, subject]); subjectId = db.exec('SELECT last_insert_rowid()')[0].values[0][0]; }
		}
		let chapterId = null;
		if (subjectId) {
			const cres = runQuery('SELECT id FROM chapters WHERE subject_id=? AND name=?', [subjectId, chapter]);
			if (cres.length && cres[0].values.length) chapterId = cres[0].values[0][0];
			else { db.run('INSERT INTO chapters(subject_id,name) VALUES(?,?)', [subjectId, chapter]); chapterId = db.exec('SELECT last_insert_rowid()')[0].values[0][0]; }
		}
		db.run('INSERT INTO questions(board_id,subject_id,chapter_id,marks,year,text) VALUES(?,?,?,?,?,?)', [boardId, subjectId, chapterId, marks, year, qtext]);
	}
	saveDBToLocalStorage();
	document.getElementById('quickQuestions').value = '';
	renderQuestions();
}

async function handlePdfUpload(file) {
	const arrayBuffer = await file.arrayBuffer();
	const loadingTask = pdfjsLib.getDocument({data: arrayBuffer});
	const pdf = await loadingTask.promise;
	let fullText = '';
	for (let p=1; p<=pdf.numPages; p++) {
		const page = await pdf.getPage(p);
		const content = await page.getTextContent();
		const strings = content.items.map(i=>i.str);
		fullText += strings.join(' ') + '\n\n';
	}
	// simple split: each double newline block becomes a question
	const blocks = fullText.split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
	const res = [];
	for (const b of blocks) {
		db.run('INSERT INTO questions(board_id,marks,text) VALUES(?,?,?)', [currentBoardId, 3, b]);
	}
	saveDBToLocalStorage();
	renderQuestions();
}

function createPlaylist(name) {
	db.run('INSERT INTO playlists(name) VALUES(?)', [name]);
	saveDBToLocalStorage();
	renderPlaylists();
}

function renderPlaylists() {
	const el = document.getElementById('playlists');
	el.innerHTML = '';
	const res = runQuery('SELECT id,name FROM playlists ORDER BY id DESC');
	if (!res.length) return;
	for (const row of res[0].values) {
		const [id, name] = row;
		// get item count
		const cntRes = runQuery('SELECT COUNT(*) FROM playlist_items WHERE playlist_id=?', [id]);
		const count = (cntRes.length && cntRes[0].values[0][0]) || 0;

		const card = document.createElement('div');
		card.className = 'playlist-card p-3 rounded mb-3';

		const header = document.createElement('div');
		header.className = 'playlist-header';
		header.innerHTML = `<div>
			<div class="text-lg font-semibold">${escapeHtml(name)}</div>
			<div class="playlist-meta">${count} question${count!==1? 's':''}</div>
		</div>`;

		const actions = document.createElement('div');
		actions.className = 'flex gap-2 items-center';
		const viewBtn = document.createElement('button');
		viewBtn.className = 'px-3 py-1 bg-indigo-600 text-white rounded text-sm';
		viewBtn.textContent = 'View';
		const delBtn = document.createElement('button');
		delBtn.className = 'px-3 py-1 bg-red-500 text-white rounded text-sm';
		delBtn.textContent = 'Delete';
		actions.appendChild(viewBtn);
		actions.appendChild(delBtn);

		header.appendChild(actions);
		card.appendChild(header);

		const itemsWrap = document.createElement('div');
		itemsWrap.className = 'playlist-items mt-3 hidden';
		card.appendChild(itemsWrap);

		viewBtn.onclick = () => {
			const open = !itemsWrap.classList.contains('hidden');
			if (open) { itemsWrap.classList.add('hidden'); viewBtn.textContent = 'View'; }
			else { itemsWrap.classList.remove('hidden'); viewBtn.textContent = 'Hide'; showPlaylistContents(id, itemsWrap); }
		};

		delBtn.onclick = () => {
			if (!confirm('Delete playlist and its associations?')) return;
			db.run('DELETE FROM playlist_items WHERE playlist_id=?', [id]);
			db.run('DELETE FROM playlists WHERE id=?', [id]);
			saveDBToLocalStorage();
			renderPlaylists();
		};

		el.appendChild(card);
	}
}

function showPlaylistContents(pid, container) {
	container.innerHTML = '';
	const res = runQuery('SELECT q.id, q.text, q.marks FROM questions q JOIN playlist_items pi ON pi.question_id=q.id WHERE pi.playlist_id=? ORDER BY pi.id DESC', [pid]);
	if (!res.length || !res[0].values.length) {
		container.innerHTML = '<div class="text-sm text-slate-500">No questions in this playlist</div>';
		return;
	}
	for (const r of res[0].values) {
		const [qid, text, marks] = r;
		const it = document.createElement('div');
		it.className = 'playlist-item p-3 rounded mb-2 flex justify-between items-start gap-3';
		const left = document.createElement('div');
		left.innerHTML = `<div class="text-sm font-medium">${marks} marks</div><div class="text-sm mt-1 text-slate-700">${escapeHtml(text).slice(0,200)}</div>`;
		const right = document.createElement('div');
		right.className = 'flex flex-col gap-2';
		const removeBtn = document.createElement('button');
		removeBtn.className = 'px-2 py-1 bg-red-400 text-white rounded text-sm';
		removeBtn.textContent = 'Remove';
		removeBtn.onclick = () => { db.run('DELETE FROM playlist_items WHERE playlist_id=? AND question_id=?', [pid, qid]); saveDBToLocalStorage(); showPlaylistContents(pid, container); renderPlaylists(); };
		right.appendChild(removeBtn);
		it.appendChild(left);
		it.appendChild(right);
		container.appendChild(it);
	}
}

function generateMTP(count, marksPref) {
	let sql = 'SELECT id, text, marks FROM questions';
	const params = [];
	if (currentBoardId) { sql += ' WHERE board_id=?'; params.push(currentBoardId); }
	const res = runQuery(sql, params);
	if (!res.length) return;
	let pool = res[0].values.map(v=>({id:v[0], text:v[1], marks:v[2]}));
	if (marksPref && marksPref.length) {
		// boost preferred marks by duplicating
		const boosted = [];
		for (const q of pool) {
			boosted.push(q);
			if (marksPref.includes(String(q.marks))) boosted.push(q, q);
		}
		pool = boosted;
	}
	// random pick
	const picked = [];
	const available = [...pool];
	while (picked.length < count && available.length) {
		const idx = Math.floor(Math.random()*available.length);
		const item = available.splice(idx,1)[0];
		if (!picked.find(p=>p.id===item.id)) picked.push(item);
	}
	const out = document.getElementById('generated');
	out.innerHTML = '<h4 class="font-medium">Generated MTP</h4>';
	for (const p of picked) {
		const d = document.createElement('div');
		d.className = 'p-2 bg-slate-50 rounded';
		d.innerHTML = `<div class="text-sm font-medium">${p.marks} marks</div><div class="text-sm">${escapeHtml(p.text)}</div>`;
		out.appendChild(d);
	}
}

function exportDb() {
	const data = db.export();
	const blob = new Blob([data], {type: 'application/octet-stream'});
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url; a.download = 'studyme-db.sqlite'; a.click();
	URL.revokeObjectURL(url);
}

function importDbFile(file) {
	const reader = new FileReader();
	reader.onload = (e) => {
		const u8 = new Uint8Array(e.target.result);
		db = new SQL.Database(u8);
		saveDBToLocalStorage();
		renderBoards(); renderQuestions(); renderPlaylists();
	};
	reader.readAsArrayBuffer(file);
}

// Wire UI
window.addEventListener('DOMContentLoaded', async () => {
	await initDB();
	document.getElementById('createBoard').onclick = () => { const v = document.getElementById('newBoardName').value.trim(); if (v) createBoard(v); document.getElementById('newBoardName').value=''; };
	document.getElementById('addQuick').onclick = () => addQuickQuestions(document.getElementById('quickQuestions').value);
	document.getElementById('pdfUpload').addEventListener('change', (e)=>{ const f=e.target.files[0]; if (f) handlePdfUpload(f); });
	document.getElementById('createPlaylist').onclick = () => { const v=document.getElementById('playlistName').value.trim(); if (v) { createPlaylist(v); document.getElementById('playlistName').value=''; }};
	document.getElementById('generate').onclick = () => { const c=parseInt(document.getElementById('genCount').value)||10; const marks=document.getElementById('genMarks').value.split(',').map(s=>s.trim()).filter(Boolean); generateMTP(c, marks); };
	document.getElementById('exportDb').onclick = exportDb;
	document.getElementById('importDb').onclick = () => { const inp = document.createElement('input'); inp.type='file'; inp.accept='.sqlite,.db'; inp.onchange=(e)=>{ if (e.target.files[0]) importDbFile(e.target.files[0]); }; inp.click(); };
});

