import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Download, LayoutDashboard, LogOut, Search, ShieldCheck, SlidersHorizontal, Users, Vote, X, Check, Clock3, ArrowUpRight, Menu } from 'lucide-react'
import { firebaseConfigured, auth, db, functions } from './firebase.js'
import { GoogleAuthProvider, RecaptchaVerifier, onAuthStateChanged, signInWithCustomToken, signInWithPhoneNumber, signInWithPopup, signOut } from 'firebase/auth'
import { collection, doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'

const roles = [
  { icon: '✳', title: 'Trưởng đoàn', category: 'Ban Thường vụ', color: 'coral' },
  { icon: '↗', title: 'Phó đoàn 1', category: 'Ban Thường vụ', color: 'blue' },
  { icon: '↗', title: 'Phó đoàn 2', category: 'Ban Thường vụ', color: 'blue' },
  { icon: '▤', title: 'Thư ký', category: 'Ban Thường vụ', color: 'yellow' },
  { icon: '▧', title: 'Thủ quỹ', category: 'Ban Thường vụ', color: 'yellow' },
  { icon: '♡', title: 'Trưởng Chiên', category: 'Các ngành', color: 'coral' },
  { icon: '♡', title: 'Trưởng Ấu', category: 'Các ngành', color: 'coral' },
  { icon: '♡', title: 'Trưởng Thiếu', category: 'Các ngành', color: 'coral' },
  { icon: '♡', title: 'Trưởng Nghĩa', category: 'Các ngành', color: 'coral' },
  { icon: '♡', title: 'Trưởng Hiệp', category: 'Các ngành', color: 'coral' },
  { icon: '◎', title: 'Ủy viên Truyền thông', category: 'Các ngành', color: 'blue' },
]
const sectors = ['Ngành Chiên', 'Ngành Ấu', 'Ngành Thiếu', 'Ngành Nghĩa', 'Ngành Hiệp', 'Ban Điều hành', 'Khác']
const normalizeText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
const normalizeSector = value => {
  const key = normalizeText(value).replace(/^nganh\s+/, '')
  if (key === 'bdh') return 'Ban Điều hành'
  return sectors.find(sector => normalizeText(sector).replace(/^nganh\s+/, '') === key) || ''
}
const toDateInput = value => {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  if (typeof value === 'number' && value > 0) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000)
    return date.toISOString().slice(0, 10)
  }
  const text = String(value).trim()
  const dmy = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return text.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || ''
}

function Avatar({ person, size = 'normal' }) { return <div className={`avatar ${person.color} ${size}`}>{person.initials}</div> }
function parseCsvRows(text) {
  const source = text.replace(/^\uFEFF/, '')
  const firstLine = source.split(/\r?\n/, 1)[0] || ''
  const delimiter = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0]
  const rows = []
  let row = [], value = '', quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (char === '"' && quoted && source[index + 1] === '"') { value += '"'; index += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === delimiter && !quoted) { row.push(value); value = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1
      row.push(value); rows.push(row); row = []; value = ''
    } else value += char
  }
  if (value || row.length) { row.push(value); rows.push(row) }
  return rows
}
function App() {
  const [tab, setTab] = useState('dashboard')
  const [round, setRound] = useState(1)
  const [selected, setSelected] = useState([])
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [smsConfirmation, setSmsConfirmation] = useState(null)
  const [sendingSms, setSendingSms] = useState(false)
  const [loginCode, setLoginCode] = useState('')
  const [loggingInWithCode, setLoggingInWithCode] = useState(false)
  const [issuedCode, setIssuedCode] = useState(null)
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [memberEntry, setMemberEntry] = useState({ name: '', sector: '', birthDate: '', email: '' })
  const [pendingMembers, setPendingMembers] = useState([])
  const [memberInputMode, setMemberInputMode] = useState('manual')
  const [importingMembers, setImportingMembers] = useState(false)
  const [savingMembers, setSavingMembers] = useState(false)
  const memberFileRef = useRef(null)
  const recaptchaRef = useRef(null)
  const [authUser, setAuthUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [election, setElection] = useState(null)
  const [roundTallies, setRoundTallies] = useState({})
  const [votedRounds, setVotedRounds] = useState({})
  const [loadingData, setLoadingData] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [roleAssignments, setRoleAssignments] = useState({})
  const [members, setMembers] = useState([])
  const isAdmin = profile?.role === 'admin'
  const ranked = useMemo(() => candidates.filter(person => round === 1 || person.elected).map(person => ({ ...person, votes: roundTallies[person.id] || 0 })).sort((a, b) => b.votes - a.votes), [candidates, roundTallies, round])
  const filtered = ranked.filter(person => `${person.name} ${person.sector}`.toLowerCase().includes(query.toLowerCase()))
  const ballotCandidates = round === 1 ? candidates : candidates.filter(person => person.elected)
  const maxSelection = round === 1 ? 11 : 5
  const voterCount = election?.voterCount || 0
  const votedCount = election?.[`round${round}VotedCount`] || 0
  const pct = voterCount ? Math.round((votedCount / voterCount) * 100) : 0
  const notify = (message) => { setNotice(message); window.setTimeout(() => setNotice(''), 3000) }
  const authErrorText = error => ({
    'auth/operation-not-allowed': 'Phương thức đăng nhập chưa được bật. Vào Firebase Console → Authentication → Sign-in method để bật Google và Phone.',
    'auth/unauthorized-domain': 'Tên miền trang web chưa được cho phép. Thêm GitHub Pages domain tại Authentication → Settings → Authorized domains.',
    'auth/popup-blocked': 'Trình duyệt chặn cửa sổ Google. Hãy cho phép popup rồi thử lại.',
    'auth/too-many-requests': 'Có nhiều lần thử liên tiếp. Vui lòng đợi một lúc rồi thử lại.',
    'permission-denied': 'Số điện thoại chưa được admin đăng ký trong danh sách HDT.',
    'functions/permission-denied': 'Mã không hợp lệ hoặc đã bị thu hồi. Hãy hỏi admin để cấp mã mới.',
    'functions/resource-exhausted': 'Có quá nhiều lần thử. Vui lòng đợi rồi thử lại.',
    'functions/not-found': 'Cloud Function cần để lưu danh sách chưa được triển khai. Hãy chạy firebase deploy --only functions rồi thử lại.',
    'functions/unauthenticated': 'Phiên đăng nhập đã hết hạn. Hãy đăng xuất rồi đăng nhập lại bằng tài khoản admin.',
  }[error.code] || error.message || 'Đăng nhập chưa thành công. Vui lòng thử lại.')
  const loginWithCode = async () => {
    if (!loginCode.trim()) return notify('Nhập mã đăng nhập do admin cấp.')
    setLoggingInWithCode(true)
    try {
      const response = await httpsCallable(functions, 'redeemLoginCode')({ code: loginCode })
      await signInWithCustomToken(auth, response.data.token)
    } catch (error) { notify(authErrorText(error)) }
    finally { setLoggingInWithCode(false) }
  }
  const issueLoginCode = async uid => {
    try {
      const response = await httpsCallable(functions, 'issueLoginCode')({ uid })
      setIssuedCode(response.data)
    } catch (error) { notify(authErrorText(error)) }
  }
  const addPendingMembers = voters => {
    const key = voter => `${voter.name.trim().toLocaleLowerCase('vi')}|${voter.sector.trim().toLocaleLowerCase('vi')}`
    setPendingMembers(current => {
      const seen = new Set(current.map(key))
      return [...current, ...voters.filter(voter => voter.name && !seen.has(key(voter)) && seen.add(key(voter)))]
    })
  }
  const addManualMember = event => {
    event.preventDefault()
    if (!memberEntry.name.trim()) return notify('Vui lòng nhập họ tên Huynh trưởng.')
    if (!memberEntry.sector) return notify('Vui lòng chọn ngành.')
    if (pendingMembers.length >= 300) return notify('Mỗi lần chỉ thêm tối đa 300 Huynh trưởng.')
    addPendingMembers([{ name: memberEntry.name.trim(), sector: memberEntry.sector, birthDate: memberEntry.birthDate, email: memberEntry.email.trim() }])
    setMemberEntry({ name: '', sector: '', birthDate: '', email: '' })
  }
  const importMemberFile = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.csv')) return notify('Vui lòng chọn file Excel .xlsx hoặc .csv.')
    if (file.size > 5 * 1024 * 1024) return notify('File Excel tối đa 5 MB.')
    setImportingMembers(true)
    try {
      const rows = fileName.endsWith('.csv')
        ? parseCsvRows(await file.text())
        : await (await import('read-excel-file/browser')).readSheet(file)
      const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
      if (!rows.length) throw new Error('Trang tính đang trống.')
      const headers = rows[0].map(normalized)
      const nameColumn = headers.findIndex(value => /(^| )(ho ten|ho va ten|ten|name)( |$)/.test(value))
      const hasHeader = nameColumn >= 0
      const sectorColumn = hasHeader ? headers.findIndex(value => /^(nganh|nganh hoc|sector)$/.test(value)) : 1
      const birthDateColumn = hasHeader ? headers.findIndex(value => /^(ngay sinh|birth date|birthdate|dob)$/.test(value)) : -1
      const emailColumn = hasHeader ? headers.findIndex(value => /^(email|thu dien tu)$/.test(value)) : 2
      const actualNameColumn = hasHeader ? nameColumn : 0
      const records = rows.slice(hasHeader ? 1 : 0).map(row => ({
        name: String(row[actualNameColumn] ?? '').trim(),
        sector: sectorColumn >= 0 ? normalizeSector(row[sectorColumn]) : '',
        birthDate: birthDateColumn >= 0 ? toDateInput(row[birthDateColumn]) : '',
        email: emailColumn >= 0 ? String(row[emailColumn] ?? '').trim() : '',
      })).filter(voter => voter.name)
      if (!records.length) throw new Error('Không tìm thấy họ tên. Hãy để cột A là Họ tên.')
      const missingSector = records.findIndex(voter => !voter.sector)
      if (missingSector >= 0) throw new Error(`Thiếu ngành ở dòng dữ liệu ${missingSector + 1}. Hãy điền ngành cho từng người.`)
      if (records.length + pendingMembers.length > 300) throw new Error('Danh sách tối đa 300 người mỗi lần thêm.')
      addPendingMembers(records)
      notify(`Đã đọc ${records.length} dòng từ ${file.name}. Hãy kiểm tra danh sách rồi lưu.`)
    } catch (error) { notify(error.message || 'Không đọc được file Excel.') }
    finally { setImportingMembers(false) }
  }
  const downloadMemberTemplate = () => {
    const csv = '\uFEFFHọ tên,Ngành,Ngày sinh,Email\r\nNguyễn Văn An,Ngành Nghĩa,15/04/1995,an@example.com\r\n'
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'mau-danh-sach-HDT.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const addMembers = async () => {
    if (!pendingMembers.length) return notify('Hãy nhập hoặc import danh sách HDT trước.')
    setSavingMembers(true)
    try {
      const response = await httpsCallable(functions, 'adminAddVoters')({ voters: pendingMembers })
      const { added, skipped } = response.data
      setShowAddMembers(false)
      setPendingMembers([])
      setMemberEntry({ name: '', sector: '', birthDate: '', email: '' })
      notify(`Đã thêm ${added} Huynh trưởng${skipped ? `; bỏ qua ${skipped} dòng trùng` : ''}.`)
    } catch (error) {
      notify(error.code === 'functions/permission-denied'
        ? 'Tài khoản hiện tại chưa được nhận diện là admin trong hồ sơ users của dự án Firebase này.'
        : authErrorText(error))
    }
    finally { setSavingMembers(false) }
  }
  const sendPhoneCode = async () => {
    const digits = phoneInput.replace(/[^\d+]/g, '')
    const e164 = digits.startsWith('+') ? digits : digits.startsWith('0') ? `+84${digits.slice(1)}` : `+84${digits}`
    if (e164.length < 11 || e164.length > 16) return notify('Vui lòng nhập số điện thoại hợp lệ, ví dụ 0912345678.')
    setSendingSms(true)
    try {
      if (!recaptchaRef.current) recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' })
      const confirmation = await signInWithPhoneNumber(auth, e164, recaptchaRef.current)
      setSmsConfirmation(confirmation)
      notify('Đã gửi mã xác minh. Hãy kiểm tra tin nhắn SMS.')
    } catch (error) {
      recaptchaRef.current?.clear()
      recaptchaRef.current = null
      notify(authErrorText(error))
    } finally { setSendingSms(false) }
  }
  const confirmPhoneCode = async () => {
    if (!smsConfirmation || smsCode.trim().length < 6) return notify('Nhập mã xác minh 6 chữ số trong tin nhắn.')
    try { await smsConfirmation.confirm(smsCode.trim()) }
    catch (error) { notify(authErrorText(error)) }
  }
  useEffect(() => {
    if (!auth) { setAuthReady(true); return }
    return onAuthStateChanged(auth, async user => {
      setAuthReady(false)
      setAuthUser(user)
      setProfile(null)
      if (user && db) {
        try {
          let snap = await getDoc(doc(db, 'users', user.uid))
          if (!snap.exists() && user.phoneNumber && functions) {
            await httpsCallable(functions, 'claimPhoneVoter')()
            snap = await getDoc(doc(db, 'users', user.uid))
          }
          if (snap.exists()) setProfile(snap.data())
        } catch (error) { notify(`Không đọc được hồ sơ Firebase: ${error.message}`) }
      }
      setAuthReady(true)
    })
  }, [])
  useEffect(() => {
    if (!db || !authUser || !profile?.active) return
    setLoadingData(true)
    const unsubs = []
    const fail = error => { setLoadingData(false); notify(`Lỗi đọc Firestore: ${error.message}`) }
    unsubs.push(onSnapshot(doc(db, 'elections', 'current'), snap => {
      const electionData = snap.exists() ? snap.data() : null
      setElection(electionData)
      if (electionData?.activeRound) setRound(electionData.activeRound)
      setLoadingData(false)
    }, fail))
    unsubs.push(onSnapshot(collection(db, 'elections', 'current', 'candidates'), snap => {
      setCandidates(snap.docs.map((item, index) => {
        const data = item.data()
        const colors = ['peach','lavender','blue','mint','sand','pink']
        const initials = data.initials || (data.name || '?').trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase()
        return { id: item.id, ...data, elected: data.electedRound1 === true, initials, color: data.color || colors[index % colors.length], sector: data.sector || '' }
      }).filter(item => item.active !== false))
    }, fail))
    if (profile.role === 'admin') {
      unsubs.push(onSnapshot(collection(db, 'users'), snap => setMembers(snap.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.role !== 'admin')), fail))
    }
    const roundId = `round${round}`
    unsubs.push(onSnapshot(collection(db, 'elections', 'current', 'tallies', roundId, 'candidates'), snap => {
      const result = {}
      snap.docs.forEach(item => { result[item.id] = item.data().votes || 0 })
      setRoundTallies(result)
    }, fail))
    for (const ballotRound of [1, 2]) {
      unsubs.push(onSnapshot(doc(db, 'elections', 'current', 'ballots', authUser.uid, 'rounds', String(ballotRound)), snap => {
        setVotedRounds(current => ({ ...current, [ballotRound]: snap.exists() }))
      }, fail))
    }
    return () => unsubs.forEach(unsubscribe => unsubscribe())
  }, [authUser, profile?.active, profile?.role, round])
  useEffect(() => {
    if (election?.roles) setRoleAssignments(election.roles)
  }, [election?.roles])
  const selectCandidate = (id) => {
    if (election?.status !== 'open' || election?.activeRound !== round || votedRounds[round]) return notify('Vòng này hiện không nhận thêm phiếu.')
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : current.length < maxSelection ? [...current, id] : current)
    if (!selected.includes(id) && selected.length >= maxSelection) notify(`Bạn chỉ có thể chọn tối đa ${maxSelection} người.`)
  }
  const submitBallot = async () => {
    if (selected.length !== maxSelection) return notify(`Vui lòng chọn đủ ${maxSelection} người trước khi xác nhận.`)
    if (election?.status !== 'open' || election?.activeRound !== round || votedRounds[round]) return notify('Vòng này hiện không nhận thêm phiếu.')
    if (!functions) return notify('Chưa cấu hình Firebase Functions.')
    try {
      await httpsCallable(functions, 'submitBallot')({ round, candidateIds: selected })
      setVotedRounds(current => ({ ...current, [round]: true }))
      notify(`Phiếu vòng ${round} đã được ghi nhận thành công.`)
      setTab('dashboard')
    } catch (error) { notify(error.message || 'Không gửi được phiếu bầu.') }
  }
  const saveRoleAssignments = async () => {
    if (!isAdmin) return notify('Chỉ admin đoàn mới có quyền lưu phân công.')
    try {
      await updateDoc(doc(db, 'elections', 'current'), { roles: roleAssignments })
      notify('Đã lưu phân công lên Firebase.')
    } catch (error) { notify(`Không lưu được phân công: ${error.message}`) }
  }
  const nav = [
    { key: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { key: 'vote', label: 'Bầu chọn', icon: Vote, dot: true },
    { key: 'results', label: 'Kết quả', icon: ClipboardList },
    ...(isAdmin ? [{ key: 'members', label: 'Danh sách HDT', icon: Users }, { key: 'roles', label: 'Phân chức vụ', icon: SlidersHorizontal }] : []),
  ]
  if (!firebaseConfigured || !auth || !db) return <div className="setup-screen"><section className="panel setup-card"><div className="brand-mark">✳</div><h1>Cần cấu hình Firebase</h1><p>Ứng dụng hiện chưa kết nối dự án Firebase nên không hiển thị dữ liệu mẫu hoặc nhận phiếu bầu.</p><p>Điền cấu hình ứng dụng Web trong <code>.env.local</code>, sau đó bật Authentication và Firestore.</p><small>Xem hướng dẫn thiết lập trong README.md</small></section></div>
  if (!authReady) return <div className="setup-screen"><section className="panel setup-card"><h1>Đang kiểm tra đăng nhập…</h1></section></div>
  if (!authUser) return <div className="setup-screen"><section className="panel setup-card"><div className="brand-mark">✳</div><h1>Đăng nhập cổng bầu chọn</h1><p>Nhập mã riêng do admin đoàn cấp. Không cần tài khoản Google hoặc mã SMS.</p><div className="login-method"><b>Mã đăng nhập cá nhân</b><small>Admin gửi riêng mã cho bạn. Trình duyệt sẽ ghi nhớ đăng nhập sau lần đầu.</small><input className="login-input access-code-input" autoComplete="one-time-code" placeholder="VD: ABCD-EFGH-JKLM" value={loginCode} onChange={event=>setLoginCode(event.target.value.toUpperCase())} onKeyDown={event=>event.key==='Enter'&&loginWithCode()}/><button className="primary-button" onClick={loginWithCode} disabled={loggingInWithCode}>{loggingInWithCode?'Đang xác minh…':'Đăng nhập bằng mã'}</button></div><details className="login-alternatives"><summary>Cách đăng nhập khác</summary><div className="login-alt-content"><button className="outline-button login-google" onClick={() => signInWithPopup(auth, new GoogleAuthProvider()).catch(error => notify(authErrorText(error)))}>Tiếp tục với Google</button><div className="login-divider"><span>hoặc SMS</span></div><input className="login-input" type="tel" inputMode="tel" autoComplete="tel" placeholder="Số điện thoại, ví dụ 0912345678" value={phoneInput} onChange={event=>setPhoneInput(event.target.value)} disabled={!!smsConfirmation}/>{smsConfirmation&&<input className="login-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Mã xác minh 6 số" value={smsCode} onChange={event=>setSmsCode(event.target.value)}/>}<button className="outline-button login-google" onClick={smsConfirmation?confirmPhoneCode:sendPhoneCode} disabled={sendingSms}>{sendingSms?'Đang gửi…':smsConfirmation?'Xác nhận mã SMS':'Gửi mã SMS'}</button><div id="recaptcha-container"/></div></details><small className="login-footnote">Mã chỉ đăng nhập được tài khoản HDT đã được admin kích hoạt.</small>{notice&&<small className="setup-error">{notice}</small>}</section></div>
  if (!profile?.active) return <div className="setup-screen"><section className="panel setup-card"><div className="brand-mark">✳</div><h1>Tài khoản chưa được duyệt</h1><p>{authUser.email} chưa được admin đoàn thêm vào danh sách HDT. Vui lòng liên hệ admin để kích hoạt quyền truy cập.</p><button className="outline-button" onClick={() => signOut(auth)}><LogOut size={16}/> Đăng xuất</button></section></div>
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark"><span>✳</span></div><div><b>Đoàn Gioan Baotixita</b><small>GIÁO XỨ BẢO SƠN</small></div><button className="mobile-close" onClick={() => setMenuOpen(false)}><X size={17}/></button></div>
      <div className="workspace-label">KHÔNG GIAN LÀM VIỆC</div>
      <button className="workspace-switch"><div className="tiny-emblem">✳</div><span><b>Ban điều hành</b><small>{election?.term || 'Chưa thiết lập nhiệm kỳ'}</small></span><ChevronDown size={16}/></button>
      <div className="nav-label">MENU CHÍNH</div>
      <nav>{nav.map(item => <button key={item.key} className={`nav-item ${tab === item.key ? 'active' : ''}`} onClick={() => { setTab(item.key); setMenuOpen(false) }}><item.icon size={18}/><span>{item.label}</span>{item.dot && <i className="nav-dot"/>}</button>)}</nav>
    <div className="sidebar-bottom">
        <button className="nav-item" onClick={() => notify('Hướng dẫn bầu chọn sẽ sớm được cập nhật.')}><CircleHelp size={18}/><span>Trợ giúp</span></button>
        <div className="admin-toggle"><div className="admin-icon"><ShieldCheck size={17}/></div><div><b>{isAdmin ? 'Quản trị viên' : 'Tài khoản HDT'}</b><small>{profile.sector || 'Đã xác thực Firebase'}</small></div></div>
        <button className="profile" onClick={() => signOut(auth).catch(error => notify(error.message))}><Avatar person={{ initials: (profile.name || authUser.displayName || authUser.email || 'H').split(/\s+/).slice(-2).map(x=>x[0]).join('').toUpperCase(), color: 'olive' }}/><span><b>{profile.name || authUser.displayName || authUser.email}</b><small>{profile.title || profile.sector || 'Huynh trưởng'}</small></span><LogOut size={15}/></button>
      </div>
    </aside>
    {menuOpen && <button className="scrim" aria-label="Đóng menu" onClick={() => setMenuOpen(false)}/>}
    <main className="main-area">
      <header className="topbar"><div className="crumb"><button className="hamburger" onClick={() => setMenuOpen(true)}><Menu size={20}/></button><span>Cổng thông tin</span><ChevronRight size={15}/><b>{nav.find(item => item.key === tab)?.label || 'Tổng quan'}</b></div><div className="top-actions"><span className="cycle-pill"><i/> {election?.status === 'open' ? 'ĐANG DIỄN RA' : 'CHƯA MỞ'}</span><button className="icon-button" onClick={() => notify('Bạn không có thông báo mới.')}><Bell size={18}/></button><div className="top-divider"/><button className="top-profile" onClick={() => signOut(auth)}><Avatar person={{ initials: (profile.name || authUser.displayName || 'H').split(/\s+/).slice(-2).map(x=>x[0]).join('').toUpperCase(), color: 'olive' }} size="small"/><ChevronDown size={14}/></button></div></header>
      <div className="content">
        <div className="welcome-line"><div><div className="eyebrow"><span>✳</span> ĐOÀN GIOAN BAOTIXITA · GIÁO XỨ BẢO SƠN</div><h1>{tab === 'dashboard' ? `Xin chào, ${profile.name || authUser.displayName || 'Huynh trưởng'}` : tab === 'vote' ? 'Phiếu bầu của bạn' : tab === 'results' ? 'Kết quả bầu chọn' : tab === 'roles' ? 'Phân công chức vụ' : 'Danh sách Huynh trưởng'} <span className="wave">✦</span></h1><p>Dữ liệu bầu cử được cập nhật trực tiếp từ Firebase.</p></div><button className="help-button" onClick={() => notify('Liên hệ admin đoàn để được hỗ trợ.')}><CircleHelp size={16}/> Hướng dẫn bầu chọn</button></div>
        <div className="election-banner"><div className="banner-pattern"/><div className="banner-icon"><Vote size={21}/></div><div className="banner-copy"><span className="banner-kicker">KỲ BẦU CỬ · {election?.term || 'Nhiệm kỳ chưa thiết lập'}</span><b>{election?.name || 'Bầu chọn Ban điều hành Xứ đoàn'}</b><span>{election?.description || 'Theo dõi kỳ bầu cử được cấu hình bởi admin đoàn.'}</span></div><div className="banner-separator"/><div className="banner-deadline"><span>TRẠNG THÁI</span><b>{election?.status === 'open' ? `Vòng ${election.activeRound}` : 'Chưa mở'}</b><span>{election?.endsAt?.toDate ? `Kết thúc ${election.endsAt.toDate().toLocaleString('vi-VN')}` : 'Chưa đặt thời hạn'}</span></div><button className="banner-cta" onClick={() => { setTab('vote'); setSelected([]) }} disabled={election?.status !== 'open' || votedRounds[election?.activeRound]}> {election?.status === 'open' ? votedRounds[election.activeRound] ? 'Đã bỏ phiếu' : 'Bắt đầu bầu chọn' : 'Chờ kỳ bầu cử'} <ArrowUpRight size={16}/></button></div>
        {tab === 'dashboard' && <>
          <div className="section-heading"><div><h2>Tổng quan bầu cử</h2><p>Theo dõi tiến độ và thông tin kỳ bầu cử hiện tại</p></div><button className="date-filter">◷ <span>Toàn bộ thời gian</span><ChevronDown size={14}/></button></div>
          <div className="stat-grid"><StatCard icon={<Users size={18}/>} tint="purple" label="Tổng số Huynh trưởng" value={voterCount} note="Theo danh sách cử tri"/><StatCard icon={<Vote size={18}/>} tint="green" label={`Đã tham gia vòng ${round}`} value={votedCount} suffix={` / ${voterCount}`} progress={pct} note={`${pct}% cử tri đã bỏ phiếu`}/><StatCard icon={<Clock3 size={18}/>} tint="orange" label="Vòng đang mở" value={election?.activeRound ? `Vòng ${election.activeRound}` : 'Chưa mở'} note={election?.status === 'open' ? 'Đang nhận phiếu' : 'Chờ admin mở kỳ bầu cử'}/><StatCard icon={<ShieldCheck size={18}/>} tint="blue" label="Trạng thái kỳ bầu cử" value={election?.status === 'open' ? 'Đang mở' : 'Đã đóng'} badge/> </div>
          <div className="mid-grid"><section className="panel progress-panel"><PanelTitle title="Tiến độ bầu cử" subtitle="Tình trạng tham gia theo từng vòng" action="Chi tiết" onAction={() => setTab('results')}/>{[1,2].map(r=>{const count=election?.[`round${r}VotedCount`]||0;const progress=voterCount?Math.round(count/voterCount*100):0;return <div className="round-progress" key={r}><div className={`round-icon ${election?.activeRound===r?'green-round':'gray-round'}`}>{r===1?<Check size={17}/>:<Vote size={17}/>}</div><div className="round-info"><div><b>Vòng {r} · {r===1?'Bầu chọn 11 thành viên':'Bầu chọn Ban Thường vụ'}</b><span className={`status-chip ${election?.activeRound===r?'done':'pending'}`}>{election?.activeRound===r?'ĐANG DIỄN RA':count?'ĐÃ ĐÓNG':'CHƯA MỞ'}</span></div><p>{r===1?'Chọn 11 Huynh trưởng vào Ban điều hành':'Bầu 5 thành viên từ danh sách 11 người'}</p><ProgressBar value={progress} color={r===1?'green':'gray'}/><small>{count} <i>/ {voterCount} Huynh trưởng</i><b>{progress}%</b></small></div></div>})}<div className="panel-footer"><span><b>{votedCount} Huynh trưởng</b> đã bỏ phiếu vòng {round}</span><button onClick={() => setTab('results')}>Xem kết quả <ChevronRight size={15}/></button></div></section>
          <section className="panel activity-panel"><PanelTitle title="Trạng thái dữ liệu" subtitle="Cập nhật trực tiếp từ Firebase"/><div className="activity-list"><Activity color="purple" icon={<Users size={15}/>} title={`${candidates.length} ứng viên`} detail="Danh sách đồng bộ từ Firestore" time={loadingData?'Đang tải…':'Đang cập nhật trực tiếp'}/><Activity color="green" icon={<Vote size={15}/>} title={election?.status==='open'?`Vòng ${election.activeRound} đang mở`:'Kỳ bầu cử chưa mở'} detail="Trạng thái lấy từ tài liệu kỳ bầu cử" time="Firebase Firestore"/><Activity color="orange" icon={<ShieldCheck size={15}/>} title={isAdmin?'Quyền admin đoàn':'Tài khoản HDT'} detail="Quyền được đọc từ hồ sơ đã duyệt" time={authUser.email}/></div></section></div>
          <section className="panel winners-panel"><PanelTitle title="Danh sách đang dẫn đầu" subtitle="Top 5 Huynh trưởng có số phiếu cao nhất vòng 1" action="Xem tất cả kết quả" onAction={() => setTab('results')}/><div className="table-wrap"><table><thead><tr><th>HẠNG</th><th>HUYNH TRƯỞNG</th><th>NGÀNH</th><th>SỐ PHIẾU</th><th>TỶ LỆ</th><th>TRẠNG THÁI</th></tr></thead><tbody>{ranked.slice(0,5).map((person,index)=><tr key={person.id}><td><span className={`rank ${index===0?'first':''}`}>{String(index+1).padStart(2,'0')}</span></td><td><div className="person-cell"><Avatar person={person} size="small"/><b>{person.name}</b></div></td><td><span className="sector-chip">{person.sector.replace('Ngành ','')}</span></td><td><b>{person.votes}</b> phiếu</td><td><span className="table-progress"><i style={{width:`${Math.round(person.votes/(ranked[0]?.votes || 1)*100)}%`}}/></span> {Math.round(person.votes/(voterCount || 1)*100)}%</td><td><span className="status-chip elected"><i/> Đang dẫn đầu</span></td></tr>)}</tbody></table></div></section>
        </>}
        {tab === 'vote' && <div className="vote-layout"><section className="panel ballot-panel"><div className="ballot-top"><div><span className="banner-kicker">PHIẾU BẦU CỬ · VÒNG {round}</span><h2>{round === 1 ? 'Chọn 11 thành viên Ban điều hành' : 'Chọn 5 thành viên Ban Thường vụ'}</h2><p>{round === 1 ? 'Chọn 11 Huynh trưởng mà bạn tín nhiệm. Bạn có thể tự bầu cho mình.' : 'Chọn 5 người trong danh sách 11 thành viên đã trúng cử.'}</p></div><div className="round-switch"><button className={round===1?'selected':''} onClick={() => {setRound(1);setSelected([])}}>Vòng 1</button><button className={round===2?'selected':''} onClick={() => {setRound(2);setSelected([])}}>Vòng 2</button></div></div><div className="ballot-toolbar"><label className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm kiếm Huynh trưởng..."/></label><button className="filter-button"><SlidersHorizontal size={15}/> Tất cả ngành <ChevronDown size={14}/></button><span className="selection-count">Đã chọn <b>{selected.length}</b> / {maxSelection}</span></div><div className="candidate-grid">{ballotCandidates.filter(person=>`${person.name} ${person.sector}`.toLowerCase().includes(query.toLowerCase())).map(person=><button key={person.id} className={`candidate-card ${selected.includes(person.id)?'chosen':''}`} onClick={()=>selectCandidate(person.id)}><Avatar person={person}/><span className="candidate-name"><b>{person.name}</b><small>{person.sector}</small></span><span className={`checkbox ${selected.includes(person.id)?'checked':''}`}>{selected.includes(person.id)&&<Check size={13}/>}</span></button>)}</div><div className="ballot-footer"><span><ShieldCheck size={16}/> Phiếu bầu của bạn được bảo mật</span><button className="primary-button" onClick={submitBallot}>Xác nhận phiếu bầu <ChevronRight size={16}/></button></div></section><aside className="panel ballot-aside"><div className="aside-icon"><ClipboardList size={20}/></div><h3>Hướng dẫn bỏ phiếu</h3><ol><li><span>1</span><p>Chọn đúng <b>{maxSelection} Huynh trưởng</b> mà bạn tín nhiệm.</p></li><li><span>2</span><p>Bạn có thể <b>tự chọn chính mình</b> trong danh sách.</p></li><li><span>3</span><p>Kiểm tra lựa chọn trước khi nhấn xác nhận.</p></li><li><span>4</span><p>Sau khi gửi, phiếu bầu <b>không thể chỉnh sửa</b>.</p></li></ol><div className="aside-note"><ShieldCheck size={15}/><span>Mỗi Huynh trưởng chỉ được bỏ phiếu một lần trong mỗi vòng.</span></div><div className="aside-deadline"><Clock3 size={16}/><span>Hạn bỏ phiếu<b>24/11/2025 · 23:59</b></span></div></aside></div>}
        {tab === 'results' && <section className="panel results-panel"><div className="results-header"><div><span className="banner-kicker">KỲ BẦU CỬ · {election?.term || 'Nhiệm kỳ chưa thiết lập'}</span><h2>Kết quả vòng {round}</h2><p>Công khai đầy đủ số phiếu của từng ứng viên.</p></div><button className="outline-button" onClick={()=>notify('Đang chuẩn bị biên bản kết quả...')}><Download size={16}/> Tải biên bản</button></div><div className="result-tabs"><button className={round===1?'selected':''} onClick={()=>setRound(1)}>Vòng 1 · Bầu 11 thành viên</button><button className={round===2?'selected':''} onClick={()=>setRound(2)}>Vòng 2 · Ban Thường vụ</button></div><div className="table-wrap"><table><thead><tr><th>HẠNG</th><th>HUYNH TRƯỞNG</th><th>NGÀNH</th><th>SỐ PHIẾU</th><th>TỶ LỆ PHIẾU</th><th>KẾT QUẢ</th></tr></thead><tbody>{ranked.map((person,index)=><tr key={person.id}><td><span className={`rank ${index<(round===1?11:5)?'first':''}`}>{String(index+1).padStart(2,'0')}</span></td><td><div className="person-cell"><Avatar person={person} size="small"/><b>{person.name}</b></div></td><td><span className="sector-chip">{person.sector.replace('Ngành ','')}</span></td><td><b>{person.votes}</b> phiếu</td><td><div className="result-vote"><ProgressBar value={Math.round(person.votes/(ranked[0]?.votes || 1)*100)} color={index<(round===1?11:5)?'green':'gray'}/><span>{Math.round(person.votes/(voterCount || 1)*100)}%</span></div></td><td>{index<(round===1?11:5)?<span className="status-chip elected"><i/> Trúng cử</span>:<span className="status-chip pending">Chưa trúng cử</span>}</td></tr>)}</tbody></table></div><div className="aside-note">Vòng bầu cử và kết quả hòa cần được admin chốt trong Firestore; các thao tác quản trị sẽ được bổ sung riêng.</div></section>}
        {tab === 'roles' && <section className="panel results-panel"><div className="results-header"><div><span className="banner-kicker">CƠ CẤU BAN ĐIỀU HÀNH</span><h2>Phân công chức vụ nhiệm kỳ</h2><p>Ban Thường vụ tự nhận 5 vị trí; phân công 6 vị trí ngành và truyền thông.</p></div><button className="primary-button" onClick={saveRoleAssignments}>Lưu phân công <Check size={15}/></button></div><div className="roles-grid">{roles.map((role,index)=>{const pool=index<5?ranked.filter(p=>p.elected).slice(0,5):ranked.filter(p=>p.elected).slice(5);return <div className="role-card" key={role.title}><div className={`role-symbol ${role.color}`}>{role.icon}</div><div className="role-detail"><span>{role.category}</span><b>{role.title}</b><select value={roleAssignments[role.title]||''} onChange={e=>setRoleAssignments({...roleAssignments,[role.title]:e.target.value})}><option value="">Chọn Huynh trưởng</option>{pool.map(person=><option value={person.id} key={person.id}>{person.name}</option>)}</select></div></div>})}</div><div className="aside-note"><ShieldCheck size={15}/> Phân công mẫu minh họa. Cần lưu xác nhận của Ban Thường vụ trước khi công bố.</div></section>}
        {tab === 'members' && <section className="panel results-panel"><div className="results-header"><div><span className="banner-kicker">DANH SÁCH CỬ TRI</span><h2>Huynh trưởng Xứ đoàn</h2><p>{members.length} tài khoản HDT · Dữ liệu Firestore</p></div><button className="primary-button" onClick={()=>setShowAddMembers(true)}>+ Thêm HDT</button></div><div className="ballot-toolbar"><label className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm kiếm Huynh trưởng..."/></label></div><div className="table-wrap"><table><thead><tr><th>HUYNH TRƯỞNG</th><th>NGÀNH</th><th>NGÀY SINH</th><th>TRẠNG THÁI</th><th>VÒNG 1</th><th>VÒNG 2</th><th>MÃ ĐĂNG NHẬP</th></tr></thead><tbody>{members.filter(person=>`${person.name||person.email||''} ${person.sector||''}`.toLowerCase().includes(query.toLowerCase())).map(person=><tr key={person.id}><td><div className="person-cell"><Avatar person={{...person,initials:person.initials||String(person.name||person.email||'?').split(/\s+/).slice(-2).map(x=>x[0]).join('').toUpperCase(),color:person.color||'mint'}} size="small"/><b>{person.name||person.email}</b></div></td><td><span className="sector-chip">{person.sector||'—'}</span></td><td>{person.birthDate?person.birthDate.split('-').reverse().join('/'):'—'}</td><td><span className={`status-chip ${person.active?'elected':'pending'}`}><i/> {person.active?'Hoạt động':'Chưa kích hoạt'}</span></td><td><span className="status-chip done">{person.round1Voted?'Đã bỏ phiếu':'Chưa bỏ phiếu'}</span></td><td><span className="status-chip pending">{person.round2Voted?'Đã bỏ phiếu':'Chưa bỏ phiếu'}</span></td><td><button className="outline-button" onClick={()=>issueLoginCode(person.id)}>Cấp / đổi mã</button></td></tr>)}</tbody></table>{!members.length&&<div className="empty-state">Chưa có tài khoản HDT trong Firestore.</div>}</div></section>}
        <footer className="footer"><span>© {new Date().getFullYear()} Đoàn Gioan Baotixita · Giáo xứ Bảo Sơn</span><div><span>Được xây dựng với <b>♥</b> và tinh thần phục vụ</span><i/> <button onClick={()=>notify(`Kết nối Firebase: ${firebaseConfigured?'đã cấu hình':'chưa cấu hình'}`)}>Phiên bản 1.0.0</button></div></footer>
      </div>
    </main>
    {showAddMembers&&<div className="modal-backdrop"><section className="panel code-modal add-members-modal"><button className="modal-close" onClick={()=>setShowAddMembers(false)} aria-label="Đóng"><X size={18}/></button><div className="admin-icon"><Users size={18}/></div><h2>Thêm Huynh trưởng</h2><div className="member-input-tabs"><button className={memberInputMode==='manual'?'selected':''} onClick={()=>setMemberInputMode('manual')}>Nhập biểu mẫu</button><button className={memberInputMode==='excel'?'selected':''} onClick={()=>setMemberInputMode('excel')}>Import Excel</button></div>{memberInputMode==='manual'?<form className="member-entry-form" onSubmit={addManualMember}><label><span className="member-label-heading">Họ và tên <b>*</b></span><input autoFocus value={memberEntry.name} onChange={event=>setMemberEntry({...memberEntry,name:event.target.value})} placeholder="Ví dụ: Nguyễn Văn An"/></label><label><span className="member-label-heading">Ngành <b>*</b></span><select required value={memberEntry.sector} onChange={event=>setMemberEntry({...memberEntry,sector:event.target.value})}><option value="">Chọn ngành</option>{sectors.map(sector=><option key={sector} value={sector}>{sector}</option>)}</select></label><label>Ngày sinh <span>(không bắt buộc)</span><input type="date" value={memberEntry.birthDate} max={new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date())} onChange={event=>setMemberEntry({...memberEntry,birthDate:event.target.value})}/></label><label>Email <span>(không bắt buộc)</span><input type="email" value={memberEntry.email} onChange={event=>setMemberEntry({...memberEntry,email:event.target.value})} placeholder="ten@example.com"/></label><button className="outline-button" type="submit" disabled={pendingMembers.length>=300}>+ Thêm vào danh sách</button></form>:<div className="member-excel-import"><p>Chọn file Excel <b>.xlsx</b> hoặc CSV. Cột A là họ tên, B là ngành, C là ngày sinh, D là email. Có thể có dòng tiêu đề.</p><input ref={memberFileRef} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={importMemberFile} disabled={importingMembers||pendingMembers.length>=300}/><button type="button" className="template-download" onClick={downloadMemberTemplate}>Tải mẫu CSV (mở bằng Excel)</button>{importingMembers&&<small>Đang đọc file…</small>}</div>}{pendingMembers.length>0&&<div className="pending-members"><b>Danh sách chờ thêm ({pendingMembers.length})</b><ul>{pendingMembers.map((person,index)=><li key={`${person.name}-${index}`}><span><b>{person.name}</b><small>{person.sector||'Chưa chọn ngành'}{person.birthDate?` · ${person.birthDate.split('-').reverse().join('/')}`:''}{person.email?` · ${person.email}`:''}</small></span><button type="button" onClick={()=>setPendingMembers(items=>items.filter((_,itemIndex)=>itemIndex!==index))} aria-label={`Xóa ${person.name}`}><X size={15}/></button></li>)}</ul></div>}<small className="member-modal-note">Hồ sơ được kích hoạt ngay. Sau khi lưu, dùng nút “Cấp / đổi mã” để tạo mã đăng nhập riêng.</small><div className="add-members-actions"><button className="outline-button" onClick={()=>setShowAddMembers(false)} disabled={savingMembers}>Hủy</button><button className="primary-button" onClick={addMembers} disabled={savingMembers||importingMembers||!pendingMembers.length}>{savingMembers?'Đang lưu…':`Lưu ${pendingMembers.length||''} hồ sơ`}</button></div></section></div>}
    {issuedCode&&<div className="modal-backdrop"><section className="panel code-modal"><button className="modal-close" onClick={()=>setIssuedCode(null)}><X size={18}/></button><div className="admin-icon"><ShieldCheck size={18}/></div><h2>Mã đăng nhập đã cấp</h2><p>Gửi mã này riêng cho {issuedCode.name || 'Huynh trưởng'}. Mã cũ đã bị thu hồi. Mã chỉ hiển thị lần này.</p><code>{issuedCode.code}</code><button className="primary-button" onClick={()=>navigator.clipboard?.writeText(issuedCode.code).then(()=>notify('Đã sao chép mã.')).catch(()=>notify('Hãy chọn và sao chép mã thủ công.'))}>Sao chép mã</button></section></div>}
    {notice&&<div className="toast"><span><Check size={15}/></span>{notice}<button onClick={()=>setNotice('')}><X size={15}/></button></div>}
  </div>
}

function StatCard({icon,tint,label,value,suffix,change,note,progress,badge}){return <div className="stat-card"><div className="stat-top"><div className={`stat-icon ${tint}`}>{icon}</div>{change&&<span className="stat-change">{change}</span>}{badge&&<span className="status-chip elected"><i/> ĐANG DIỄN RA</span>}</div><span className="stat-label">{label}</span><div className="stat-value">{value}{suffix&&<small>{suffix}</small>}</div>{progress!==undefined?<><ProgressBar value={progress} color="green"/><span className="stat-note">{note}</span></>:<span className="stat-note">{note}</span>}</div>}
function ProgressBar({value,color}){return <div className={`progress-bar ${color}`}><i style={{width:`${value}%`}}/></div>}
function PanelTitle({title,subtitle,action,onAction}){return <div className="panel-title"><div><h3>{title}</h3><p>{subtitle}</p></div><button onClick={onAction}>{action}<ChevronRight size={14}/></button></div>}
function Activity({color,icon,title,detail,time}){return <div className="activity-row"><div className={`activity-icon ${color}`}>{icon}</div><div><b>{title}</b><p>{detail}</p><small>{time}</small></div></div>}

export default App
