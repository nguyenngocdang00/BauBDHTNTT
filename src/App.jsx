import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Download, Copy, LayoutDashboard, LogOut, Search, ShieldCheck, SlidersHorizontal, Users, Vote, X, Check, Clock3, ArrowUpRight, Menu, Settings, CalendarDays } from 'lucide-react'
import { firebaseConfigured, auth, db } from './firebase.js'
import { GoogleAuthProvider, onAuthStateChanged, signInAnonymously, signInWithPopup, signOut } from 'firebase/auth'
import { addDoc, collection, collectionGroup, deleteField, doc, getDoc, getDocs, onSnapshot, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore'

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
const LOGIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const createLoginCode = () => {
  const values = crypto.getRandomValues(new Uint8Array(12))
  const raw = [...values].map(value => LOGIN_CODE_ALPHABET[value % LOGIN_CODE_ALPHABET.length]).join('')
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`
}
const hashLoginCode = async code => {
  const bytes = new TextEncoder().encode(code.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
}
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
const toBkkDateTimeInput = timestamp => {
  if (!timestamp?.toDate) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(timestamp.toDate())
  const part = type => parts.find(item => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}
const fromBkkDateTimeInput = value => {
  if (!value) return null
  const date = new Date(`${value}:00+07:00`)
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date)
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
  const [loginCode, setLoginCode] = useState('')
  const [loggingInWithCode, setLoggingInWithCode] = useState(false)
  const [issuedCodes, setIssuedCodes] = useState([])
  const [issuingCodes, setIssuingCodes] = useState(false)
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [showCandidatePicker, setShowCandidatePicker] = useState(false)
  const [candidatePickerSelected, setCandidatePickerSelected] = useState([])
  const [candidatePickerSearch, setCandidatePickerSearch] = useState('')
  const [memberEntry, setMemberEntry] = useState({ name: '', sector: '', birthDate: '', email: '' })
  const [pendingMembers, setPendingMembers] = useState([])
  const [memberInputMode, setMemberInputMode] = useState('manual')
  const [importingMembers, setImportingMembers] = useState(false)
  const [savingMembers, setSavingMembers] = useState(false)
  const memberFileRef = useRef(null)
  const [authUser, setAuthUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [electionId, setElectionId] = useState('current')
  const [electionRecords, setElectionRecords] = useState([])
  const [creatingElection, setCreatingElection] = useState(false)
  const [election, setElection] = useState(null)
  const [electionForm, setElectionForm] = useState({ name: '', term: '', description: '', endsAt: '', round1Seats: '11', round2Seats: '5' })
  const [savingElection, setSavingElection] = useState(false)
  const [round2Winners, setRound2Winners] = useState([])
  const [finalizingRound1, setFinalizingRound1] = useState(false)
  const [finalizingRound2, setFinalizingRound2] = useState(false)
  const [syncingCandidates, setSyncingCandidates] = useState(false)
  const [publishingResults, setPublishingResults] = useState(false)
  const [runoffs, setRunoffs] = useState([])
  const [runoffTalliesById, setRunoffTalliesById] = useState({})
  const [runoffVoted, setRunoffVoted] = useState(false)
  const [runoffCandidateIds, setRunoffCandidateIds] = useState([])
  const [runoffSeats, setRunoffSeats] = useState('1')
  const [runoffEndsAt, setRunoffEndsAt] = useState('')
  const [runoffWinners, setRunoffWinners] = useState([])
  const [savingRunoff, setSavingRunoff] = useState(false)
  const liveTallies = useRef({})
  const [talliesByRound, setTalliesByRound] = useState({})
  const [votedRounds, setVotedRounds] = useState({})
  const [loadingData, setLoadingData] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [roleAssignments, setRoleAssignments] = useState({})
  const [members, setMembers] = useState([])
  const [rosterRecords, setRosterRecords] = useState([])
  const [deactivatingMemberId, setDeactivatingMemberId] = useState('')
  const [ballotStatus, setBallotStatus] = useState({})
  const isAdmin = profile?.role === 'admin'
  const rosterMembers = useMemo(() => rosterRecords.filter(person=>person.active===true), [rosterRecords])
  const electionHistoryLocked = Boolean((election?.round1VotedCount||0)>0||(election?.round2VotedCount||0)>0||election?.round1Finalized||election?.round2Finalized||election?.activeRound>1||runoffs.length||Object.values(ballotStatus).some(status=>status?.[1]||status?.[2]))
  const activeRunoff = runoffs.find(item => item.status === 'open') || null
  const displayedRunoff = activeRunoff || [...runoffs].sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))[0] || null
  const adminRunoffRound = election?.activeRound === 2 ? 2 : 1
  const adminDisplayedRunoff = activeRunoff?.sourceRound === adminRunoffRound ? activeRunoff : [...runoffs].filter(item => (item.sourceRound || 1) === adminRunoffRound).sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))[0] || null
  const resultRunoff = [...runoffs].filter(item => (item.sourceRound || 1) === round).sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))[0] || null
  const adminRunoffTallies = runoffTalliesById[adminDisplayedRunoff?.id] || {}
  const resultRunoffTallies = runoffTalliesById[resultRunoff?.id] || {}
  const memberRows = useMemo(() => {
    const profilesByVoterId = new Map(members.filter(person => person.voterId).map(person => [person.voterId, person]))
    const rosterIds = new Set(rosterRecords.map(person => person.id))
    const fromRoster = rosterRecords.map(person => {
      const profile = profilesByVoterId.get(person.id)
      return { ...person, ...profile, id: person.id, active:person.active===true, pendingAccount: !profile, rosterRecord: true }
    })
    const profileOnly = members.filter(person => !person.voterId || !rosterIds.has(person.voterId)).map(person => ({ ...person, rosterRecord: false }))
    return [...fromRoster, ...profileOnly]
  }, [members, rosterRecords])
  const codeableMembers = useMemo(() => rosterMembers.filter(person => person.active === true), [rosterMembers])
  const filteredCandidateRoster = useMemo(() => {
    const search=normalizeText(candidatePickerSearch)
    return rosterMembers.filter(person=>normalizeText(`${person.name||''} ${person.sector||''}`).includes(search))
  }, [rosterMembers,candidatePickerSearch])
  const roundTallies = talliesByRound[round] || {}
  const ranked = useMemo(() => candidates.filter(person => person.active !== false && (round === 1 || person.elected)).map(person => ({ ...person, votes: roundTallies[person.id] || 0 })).sort((a, b) => b.votes - a.votes), [candidates, roundTallies, round])
  const filtered = ranked.filter(person => `${person.name} ${person.sector}`.toLowerCase().includes(query.toLowerCase()))
  const ballotCandidates = activeRunoff
    ? candidates.filter(person => activeRunoff.candidateIds?.includes(person.id))
    : candidates.filter(person => person.active !== false && (round === 1 || person.elected))
  const round1Seats = Number(election?.round1Seats) || 11
  const round2Seats = Number(election?.round2Seats) || 5
  const maxSelection = activeRunoff ? activeRunoff.seats : round === 1 ? round1Seats : round2Seats
  const resultStatus = (person, index) => {
    if (election?.status === 'open' && election.activeRound === round) return index < maxSelection ? 'Đang dẫn đầu' : 'Chưa dẫn đầu'
    if (round === 1) return person.elected ? 'Trúng cử' : 'Chưa trúng cử'
    if (election?.round2Finalized) return (election.round2WinnerIds ? election.round2WinnerIds.includes(person.id) : index < round2Seats) ? 'Trúng cử' : 'Chưa trúng cử'
    return 'Chưa chốt'
  }
  const voterCount = election?.voterCount || 0
  const votedCount = election?.[`round${round}VotedCount`] || 0
  const pct = voterCount ? Math.round((votedCount / voterCount) * 100) : 0
  const notify = (message) => { setNotice(message); window.setTimeout(() => setNotice(''), 3000) }
  const logout = async () => {
    setSelected([])
    setQuery('')
    setRunoffVoted(false)
    setTab('dashboard')
    try { await signOut(auth) } catch (error) { notify(`Không đăng xuất được: ${error.message}`) }
  }
  const authErrorText = error => ({
    'auth/operation-not-allowed': 'Phương thức Google chưa được bật. Vào Firebase Console → Authentication → Sign-in method để bật Google.',
    'auth/unauthorized-domain': 'Tên miền trang web chưa được cho phép. Thêm GitHub Pages domain tại Authentication → Settings → Authorized domains.',
    'auth/popup-blocked': 'Trình duyệt chặn cửa sổ Google. Hãy cho phép popup rồi thử lại.',
    'auth/too-many-requests': 'Có nhiều lần thử liên tiếp. Vui lòng đợi một lúc rồi thử lại.',
    'permission-denied': 'Bạn chưa có quyền thao tác. Hãy liên hệ admin đoàn.',
  }[error.code] || error.message || 'Đăng nhập chưa thành công. Vui lòng thử lại.')
  const signInGoogle = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(error => notify(authErrorText(error)))
  const loginWithCode = async event => {
    event.preventDefault()
    const normalizedCode = loginCode.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (normalizedCode.length !== 12) return notify('Mã đăng nhập cần đủ 12 ký tự.')
    setLoggingInWithCode(true)
    let newAnonymousSession = false
    try {
      let user = auth.currentUser
      if (!user) {
        user = (await signInAnonymously(auth)).user
        newAnonymousSession = true
      }
      if (!user.isAnonymous) throw new Error('Hãy đăng xuất tài khoản hiện tại trước khi dùng mã HDT.')
      const codeHash = await hashLoginCode(normalizedCode)
      const codeRef = doc(db, 'loginCodes', codeHash)
      const codeSnap = await getDoc(codeRef)
      if (!codeSnap.exists()) throw new Error('Mã không đúng hoặc đã hết hạn. Hãy xin admin cấp mã mới.')
      const codeData = codeSnap.data()
      if (codeData.active !== true || !codeData.expiresAt || codeData.expiresAt.toMillis() <= Date.now()) {
        throw new Error('Mã đã hết hạn hoặc bị thu hồi. Hãy xin admin cấp mã mới.')
      }
      if (codeData.claimedUid && codeData.claimedUid !== user.uid) throw new Error('Mã đã được sử dụng. Hãy xin admin cấp mã mới.')
      const userRef = doc(db, 'users', user.uid)
      const existingProfile = await getDoc(userRef)
      if (existingProfile.exists() && existingProfile.data().voterId !== codeData.voterId) {
        throw new Error('Tài khoản này đã gắn với một hồ sơ khác. Hãy đăng xuất rồi thử lại.')
      }
      const voter = codeData
      const batch = writeBatch(db)
      batch.update(codeRef, { claimedUid: user.uid })
      const userData = {
        name: voter.name,
        email: voter.email || '',
        sector: voter.sector,
        birthDate: voter.birthDate || '',
        voterId: codeData.voterId,
        loginCodeHash: codeHash,
        active: true,
        role: 'voter',
      }
      if (!existingProfile.exists()) batch.set(userRef, { ...userData, createdAt: serverTimestamp() })
      await batch.commit()
      setProfile(userData)
      setAuthUser(user)
      setLoginCode('')
      notify(`Đăng nhập thành công. Xin chào ${voter.name}.`)
    } catch (error) {
      if (newAnonymousSession) await signOut(auth).catch(() => {})
      notify(error.code === 'permission-denied'
        ? 'Mã không đúng, đã hết hạn hoặc Firestore Rules chưa cập nhật. Hãy kiểm tra mã và nhờ admin triển khai Rules mới.'
        : ['auth/operation-not-allowed', 'auth/admin-restricted-operation'].includes(error.code)
          ? 'Firebase đang chặn tạo phiên HDT. Trong Firebase Console của project baubdhtntt, vào Authentication → Sign-in method → Anonymous, bật Enable rồi Save.'
          : error.message || 'Không đăng nhập được bằng mã.')
    } finally {
      setLoggingInWithCode(false)
    }
  }
  const issueLoginCodes = async people => {
    if (!isAdmin) return notify('Chỉ admin đoàn mới được cấp mã đăng nhập.')
    const eligible = people.map(person => rosterMembers.find(voter => voter.id === person.id)).filter(person => person?.active === true)
    if (!eligible.length) return notify('Không có hồ sơ HDT đang hoạt động để cấp mã.')
    setIssuingCodes(true)
    setIssuedCodes([])
    const successful = []
    let currentStep = 'chuẩn bị mã'
    try {
      const expiresAt = Timestamp.fromMillis(Date.now() + 4 * 60 * 60 * 1000)
      const plans = await Promise.all(eligible.map(async person => {
        const code = createLoginCode()
        return { person, code, codeHash: await hashLoginCode(code), expiresAt }
      }))
      // Keep each batch small: Firestore Rules allow at most 20 document lookups per batch.
      for (let offset = 0; offset < plans.length; offset += 5) {
        const chunk = plans.slice(offset, offset + 5)
        const batch = writeBatch(db)
        chunk.forEach(({ person, codeHash }) => {
          batch.set(doc(db, 'loginCodes', codeHash), {
            voterId: person.id,
            name: person.name,
            email: person.email || '',
            sector: person.sector,
            birthDate: person.birthDate || '',
            active: true,
            claimedUid: null,
            issuedAt: serverTimestamp(),
            expiresAt,
          })
          batch.update(doc(db, 'voterRoster', person.id), { loginCodeHash: codeHash })
        })
        currentStep = `ghi lô mã ${offset + 1}–${offset + chunk.length}`
        await batch.commit()
        successful.push(...chunk)
      }
      setIssuedCodes(successful)
      if (successful.length < eligible.length) notify(`Đã cấp ${successful.length} trên ${eligible.length} mã. Hãy thử cấp lại cho các mã còn thiếu.`)
    } catch (error) {
      if (successful.length) {
        setIssuedCodes(successful)
        notify(`Đã cấp ${successful.length} mã; phần còn lại gặp lỗi: ${error.message}`)
      } else {
        notify(error.code === 'permission-denied'
          ? `Firebase Rules từ chối bước “${currentStep}”. Hãy deploy Rules mới vào baubdhtntt; nếu vẫn lỗi, kiểm tra users/{UID} có active=true và role=admin.`
          : `Lỗi ${currentStep} (${error.code || 'không rõ'}): ${error.message}`)
      }
    } finally {
      setIssuingCodes(false)
    }
  }
  const issueLoginCode = person => issueLoginCodes([person])
  const setMemberActive = async person => {
    if (!isAdmin || !person.rosterRecord) return notify('Chỉ có thể thay đổi quyền của hồ sơ trong danh sách HDT.')
    const nextActive = person.active !== true
    if (election?.status==='open'||activeRunoff) return notify('Hãy đóng vòng bầu chọn và vòng phụ đang mở trước khi đổi trạng thái HDT.')
    const hasVoted = Boolean(ballotStatus[person.id]?.[1]||ballotStatus[person.id]?.[2]||person.round1Voted||person.round2Voted)
    if (!nextActive && !window.confirm(`Ngừng kích hoạt tài khoản của ${person.name||'HDT này'}? Người này sẽ không thể đăng nhập hoặc bỏ phiếu nữa.${hasVoted?' Phiếu đã gửi vẫn được giữ nguyên và vẫn tính vào kết quả.':''}`)) return
    setDeactivatingMemberId(person.id)
    try {
      await updateDoc(doc(db,'voterRoster',person.id),nextActive
        ? {active:true,reactivatedAt:serverTimestamp(),reactivatedBy:authUser.uid}
        : {active:false,loginCodeHash:deleteField(),deactivatedAt:serverTimestamp(),deactivatedBy:authUser.uid})
      notify(nextActive?`Đã kích hoạt lại ${person.name}. Hãy cấp mã đăng nhập mới.`:`Đã ngừng kích hoạt ${person.name}. Phiếu đã gửi được giữ nguyên.`)
    } catch (error) { notify(`Không đổi được trạng thái tài khoản: ${error.message}`) }
    finally { setDeactivatingMemberId('') }
  }
  const copyIssuedCodes = () => {
    if (!issuedCodes.length) return
    const lines = issuedCodes.map(item => `${item.person.name} | ${item.person.sector} | ${item.code}`)
    if (!navigator.clipboard) return notify('Không thể sao chép tự động. Hãy tải file mã xuống.')
    navigator.clipboard.writeText(lines.join('\n'))
      .then(() => notify('Đã sao chép danh sách mã. Hãy gửi riêng từng mã cho đúng người.'))
      .catch(() => notify('Không sao chép được; hãy tải danh sách mã xuống.'))
  }
  const copyOneIssuedCode = item => {
    if (!navigator.clipboard) return notify('Trình duyệt không hỗ trợ sao chép tự động; hãy chọn mã để sao chép.')
    navigator.clipboard.writeText(item.code)
      .then(() => notify(`Đã sao chép mã của ${item.person.name}.`))
      .catch(() => notify('Không sao chép được mã.'))
  }
  const downloadIssuedCodes = () => {
    if (!issuedCodes.length) return
    const escapeCsv = value => `"${String(value ?? '').replace(/"/g, '""')}"`
    const expiry = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' }).format(issuedCodes[0].expiresAt.toDate())
    const csv = '\uFEFFHọ tên,Ngành,Mã đăng nhập,Hết hạn\r\n' + issuedCodes.map(item => [item.person.name, item.person.sector, item.code, expiry].map(escapeCsv).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'ma-dang-nhap-HDT.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
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
    addPendingMembers([{ name: memberEntry.name.trim(), sector: memberEntry.sector, birthDate: memberEntry.birthDate, email: memberEntry.email.trim().toLowerCase() }])
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
      const headerlessHasBirthDate = !hasHeader && rows[0].length >= 4
      const sectorColumn = hasHeader ? headers.findIndex(value => /^(nganh|nganh hoc|sector)$/.test(value)) : 1
      const birthDateColumn = hasHeader ? headers.findIndex(value => /^(ngay sinh|birth date|birthdate|dob)$/.test(value)) : headerlessHasBirthDate ? 2 : -1
      const emailColumn = hasHeader ? headers.findIndex(value => /^(email|thu dien tu)$/.test(value)) : headerlessHasBirthDate ? 3 : 2
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
      const invalidEmail = records.findIndex(voter => voter.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(voter.email))
      if (invalidEmail >= 0) throw new Error(`Email không hợp lệ ở dòng dữ liệu ${invalidEmail + 1}.`)
      if (records.length + pendingMembers.length > 300) throw new Error('Danh sách tối đa 300 người mỗi lần thêm.')
      addPendingMembers(records)
      notify(`Đã đọc ${records.length} dòng từ ${file.name}. Hãy kiểm tra danh sách rồi lưu.`)
    } catch (error) { notify(error.message || 'Không đọc được file Excel.') }
    finally { setImportingMembers(false) }
  }
  const downloadMemberTemplate = () => {
    const csv = '\uFEFFHọ tên,Ngành,Ngày sinh,Email (không bắt buộc)\r\nNguyễn Văn An,Ngành Nghĩa,15/04/1995,\r\n'
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
      const batch = writeBatch(db)
      const rosterRefs = pendingMembers.map(() => doc(collection(db, 'voterRoster')))
      pendingMembers.forEach((voter, index) => {
        batch.set(rosterRefs[index], {
          name: voter.name.trim(),
          email: voter.email || '',
          sector: voter.sector,
          birthDate: voter.birthDate || '',
          active: true,
          createdAt: serverTimestamp(),
        })
      })
      await batch.commit()
      setShowAddMembers(false)
      setPendingMembers([])
      setMemberEntry({ name: '', sector: '', birthDate: '', email: '' })
      notify(`Đã thêm ${pendingMembers.length} Huynh trưởng vào danh sách.`)
    } catch (error) {
      notify(error.code === 'permission-denied' ? 'Firestore Rules chưa cho phép admin ghi danh sách. Hãy deploy firestore.rules mới.' : error.message || 'Chưa lưu được danh sách.')
    }
    finally { setSavingMembers(false) }
  }
  useEffect(() => {
    if (!auth) { setAuthReady(true); return }
    return onAuthStateChanged(auth, async user => {
      setAuthReady(false)
      setAuthUser(user)
      setProfile(null)
      if (user && db) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid))
          if (snap.exists()) setProfile(snap.data())
        } catch (error) { notify(`Không đọc được hồ sơ Firebase: ${error.message}`) }
      }
      setAuthReady(true)
    })
  }, [])
  useEffect(() => {
    setSelected([])
    setQuery('')
    setRunoffVoted(false)
    if (tab === 'vote') setTab('dashboard')
  }, [authUser?.uid, profile?.voterId])
  useEffect(() => {
    if (!db || !authUser || !profile?.active) return
    const stopElections = onSnapshot(collection(db, 'elections'), snap => {
      setElectionRecords(snap.docs.map(item=>({id:item.id,...item.data()})).sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0)))
    }, error => notify(`Không đọc được danh sách kỳ bầu cử: ${error.message}`))
    const stopActiveElection = onSnapshot(doc(db, 'appSettings', 'activeElection'), snap => {
      const nextId = snap.exists() && typeof snap.data().electionId === 'string' ? snap.data().electionId : 'current'
      setElectionId(current=>current===nextId?current:nextId)
    }, error => notify(`Không đọc được kỳ bầu cử đang chọn: ${error.message}`))
    return () => { stopElections(); stopActiveElection() }
  }, [authUser, profile?.active])
  useEffect(() => {
    setElection(null)
    setCandidates([])
    setRunoffs([])
    setTalliesByRound({})
    setVotedRounds({})
    setBallotStatus({})
    setSelected([])
    setQuery('')
    liveTallies.current = {}
    setRound(1)
  }, [electionId])
  useEffect(() => {
    if (!db || !authUser || !profile?.active) return
    setLoadingData(true)
    const unsubs = []
    const fail = error => {
      setLoadingData(false)
      if (error.code==='permission-denied'&&profile.role==='voter') {
        notify('Tài khoản đã ngừng hoạt động hoặc không còn quyền truy cập. Phiếu đã gửi vẫn được lưu.')
        signOut(auth).catch(()=>{})
        return
      }
      notify(`Lỗi đọc Firestore: ${error.message}`)
    }
    unsubs.push(onSnapshot(doc(db, 'elections', electionId), snap => {
      const electionData = snap.exists() ? snap.data() : null
      setElection(electionData)
      if (electionData?.activeRound) setRound(electionData.activeRound)
      setLoadingData(false)
    }, fail))
    unsubs.push(onSnapshot(collection(db, 'elections', electionId, 'candidates'), snap => {
      setCandidates(snap.docs.map((item, index) => {
        const data = item.data()
        const colors = ['peach','lavender','blue','mint','sand','pink']
        const initials = data.initials || (data.name || '?').trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase()
        return { ...data, id: item.id, elected: data.electedRound1 === true, initials, color: data.color || colors[index % colors.length], sector: data.sector || '' }
      }))
    }, fail))
    unsubs.push(onSnapshot(collection(db, 'elections', electionId, 'runoffs'), snap => {
      setRunoffs(snap.docs.map(item => ({ id: item.id, ...item.data() })))
    }, fail))
    if (profile.role === 'admin') {
      unsubs.push(onSnapshot(collection(db, 'users'), snap => setMembers(snap.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.role !== 'admin')), fail))
      unsubs.push(onSnapshot(collection(db, 'voterRoster'), snap => setRosterRecords(snap.docs.map(item => ({ id: item.id, ...item.data() }))), fail))
      unsubs.push(onSnapshot(collection(db, 'elections', electionId, 'ballots'), snap => {
        const result = {}
        snap.docs.forEach(item => {
          const ballot = item.data()
          if (ballot.voterId && [1, 2].includes(ballot.round)) {
            result[ballot.voterId] = { ...(result[ballot.voterId] || {}), [ballot.round]: true }
          }
        })
        setBallotStatus(current => ({ ...current, ...result }))
      }, fail))
      unsubs.push(onSnapshot(collectionGroup(db, 'rounds'), snap => {
        const result = {}
        snap.docs.forEach(item => {
          if (item.ref.parent.parent?.id !== electionId) return
          const ballot = item.data()
          if (ballot.voterId && [1, 2].includes(ballot.round) && Array.isArray(ballot.candidateIds)) {
            result[ballot.voterId] = { ...(result[ballot.voterId] || {}), [ballot.round]: true }
          }
        })
        setBallotStatus(current => ({ ...current, ...result }))
      }, fail))
    }
    for (const tallyRound of [1, 2]) {
      const roundId = `round${tallyRound}`
      unsubs.push(onSnapshot(collection(db, 'elections', electionId, 'tallies', roundId, 'candidates'), snap => {
        const result = {}
        snap.docs.forEach(item => { result[item.id] = item.data().votes || 0 })
        liveTallies.current[roundId] = result
        setTalliesByRound(current => ({ ...current, [tallyRound]: result }))
      }, fail))
    }
    if (profile.voterId) for (const ballotRound of [1, 2]) {
      unsubs.push(onSnapshot(doc(db, 'elections', electionId, 'ballots', `${ballotRound}_${profile.voterId}`), snap => {
        setVotedRounds(current => ({ ...current, [ballotRound]: snap.exists() }))
      }, fail))
    }
    return () => unsubs.forEach(unsubscribe => unsubscribe())
  }, [authUser, profile?.active, profile?.role, electionId])
  useEffect(() => {
    setRunoffVoted(false)
    if (!db || !activeRunoff?.id || !profile?.voterId) return
    return onSnapshot(doc(db, 'elections', electionId, 'runoffs', activeRunoff.id, 'ballots', profile.voterId), snap => setRunoffVoted(snap.exists()), error => notify(`Không kiểm tra được phiếu phụ: ${error.message}`))
  }, [electionId, activeRunoff?.id, profile?.voterId])
  const runoffIdsKey = runoffs.map(item=>item.id).sort().join('|')
  useEffect(() => {
    if (!db || !runoffs.length) { setRunoffTalliesById({}); return }
    const unsubs = runoffs.map(runoff=>onSnapshot(collection(db,'elections',electionId,'runoffs',runoff.id,'tallies'),snap=>{
      const totals = {}
      snap.docs.forEach(item=>{totals[item.id]=item.data().votes||0})
      setRunoffTalliesById(current=>({...current,[runoff.id]:totals}))
    },error=>notify(`Không đọc được kết quả vòng phụ ${runoff.sourceRound||1}: ${error.message}`)))
    return ()=>unsubs.forEach(unsubscribe=>unsubscribe())
  }, [db,electionId,runoffIdsKey])
  useEffect(() => {
    if (!db || !isAdmin || !displayedRunoff?.id || displayedRunoff.finalized) return
    return onSnapshot(collection(db, 'elections', electionId, 'runoffs', displayedRunoff.id, 'ballots'), snap => {
      const totals = {}
      snap.docs.forEach(ballot => new Set(ballot.data().candidateIds || []).forEach(id => { totals[id] = (totals[id] || 0) + 1 }))
      const batch = writeBatch(db)
      ;(displayedRunoff.candidateIds || []).forEach(candidateId => batch.set(doc(db, 'elections', electionId, 'runoffs', displayedRunoff.id, 'tallies', candidateId), {
        candidateId,
        votes: totals[candidateId] || 0,
        updatedAt: serverTimestamp(),
      }))
      batch.commit().catch(error => notify(`Không tổng hợp được phiếu phụ trực tiếp: ${error.message}`))
    }, error => notify(`Không đọc được phiếu phụ: ${error.message}`))
  }, [db, isAdmin, electionId, displayedRunoff?.id, displayedRunoff?.finalized])
  useEffect(() => {
    if (election?.roles) setRoleAssignments(election.roles)
  }, [election?.roles])
  useEffect(() => {
    setRound2Winners(election?.round2WinnerIds || [])
  }, [election?.round2WinnerIds])
  useEffect(() => {
    if (!db || !isAdmin || election?.status !== 'open' || !election.activeRound || !candidates.length) return
    const targetRound = election.activeRound
    let cancelled = false
    let stops = []
    let directBallots = []
    let legacyBallots = []
    let writeQueue = Promise.resolve()
    const startLiveTally = async () => {
      try {
        const tallyPath = collection(db, 'elections', electionId, 'tallies', `round${targetRound}`, 'candidates')
        const currentTallies = await getDocs(tallyPath)
        const initial = {}
        currentTallies.docs.forEach(item => { initial[item.id] = item.data().votes || 0 })
        liveTallies.current[`round${targetRound}`] = initial
        if (cancelled) return
        const updateTallies = () => {
          const totals = {};
          [...directBallots, ...legacyBallots].forEach(ballot => {
            if (ballot.ref.parent.parent?.id && ballot.ref.parent.parent.id !== electionId) return
            const data = ballot.data()
            if (data.round === targetRound && data.voterId && Array.isArray(data.candidateIds)) new Set(data.candidateIds).forEach(id => { totals[id] = (totals[id] || 0) + 1 })
          })
          writeQueue = writeQueue.then(async () => {
            if (cancelled) return
            const previous = liveTallies.current[`round${targetRound}`] || {}
            const changed = candidates.filter(person => (previous[person.id] || 0) !== (totals[person.id] || 0))
            if (!changed.length) return
            const batch = writeBatch(db)
            changed.forEach(person => batch.set(doc(db, 'elections', electionId, 'tallies', `round${targetRound}`, 'candidates', person.id), {
              candidateId: person.id,
              votes: totals[person.id] || 0,
              updatedAt: serverTimestamp(),
            }))
            await batch.commit()
            liveTallies.current[`round${targetRound}`] = { ...previous, ...Object.fromEntries(changed.map(person => [person.id, totals[person.id] || 0])) }
          }).catch(error => notify(`Không cập nhật được kết quả trực tiếp: ${error.message}`))
        }
        stops = [
          onSnapshot(collection(db, 'elections', electionId, 'ballots'), ballotSnapshot => { directBallots = ballotSnapshot.docs; updateTallies() }, error => notify(`Không đọc được phiếu để cập nhật kết quả trực tiếp: ${error.message}`)),
          onSnapshot(collectionGroup(db, 'rounds'), ballotSnapshot => { legacyBallots = ballotSnapshot.docs; updateTallies() }, error => notify(`Không đọc được các phiếu cũ để cập nhật kết quả trực tiếp: ${error.message}`)),
        ]
      } catch (error) { notify(`Không khởi động được cập nhật kết quả trực tiếp: ${error.message}`) }
    }
    startLiveTally()
    return () => { cancelled = true; stops.forEach(stop => stop()) }
  }, [db, isAdmin, electionId, election?.status, election?.activeRound, candidates])
  const selectCandidate = (id) => {
    if (activeRunoff) {
      if (runoffVoted) return notify('Bạn đã bỏ phiếu phụ đợt này rồi.')
      if (activeRunoff.status !== 'open') return notify('Đợt bỏ phiếu phụ đã đóng.')
      setSelected(current => current.includes(id) ? current.filter(item => item !== id) : current.length < activeRunoff.seats ? [...current, id] : current)
      if (!selected.includes(id) && selected.length >= activeRunoff.seats) notify(`Bạn chỉ có thể chọn ${activeRunoff.seats} người trong vòng phụ.`)
      return
    }
    if (election?.status !== 'open' || election?.activeRound !== round || votedRounds[round]) return notify('Vòng này hiện không nhận thêm phiếu.')
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : current.length < maxSelection ? [...current, id] : current)
    if (!selected.includes(id) && selected.length >= maxSelection) notify(`Bạn chỉ có thể chọn tối đa ${maxSelection} người.`)
  }
  const submitRunoffBallot = async () => {
    if (!activeRunoff || !profile?.voterId) return notify('Không tìm thấy đợt bỏ phiếu phụ đang mở hoặc hồ sơ HDT.')
    if (runoffVoted) return notify('Bạn đã bỏ phiếu phụ đợt này rồi.')
    if (selected.length !== activeRunoff.seats) return notify(`Vui lòng chọn đúng ${activeRunoff.seats} người trong nhóm hòa phiếu.`)
    const runoffRef = doc(db, 'elections', electionId, 'runoffs', activeRunoff.id)
    const ballotRef = doc(db, 'elections', electionId, 'runoffs', activeRunoff.id, 'ballots', profile.voterId)
    try {
      await runTransaction(db, async transaction => {
        const [runoffSnap, ballotSnap] = await Promise.all([transaction.get(runoffRef), transaction.get(ballotRef)])
        if (!runoffSnap.exists() || ballotSnap.exists()) throw new Error('Bạn đã bỏ phiếu phụ hoặc đợt bỏ phiếu không còn tồn tại.')
        const currentRunoff = runoffSnap.data()
        if (currentRunoff.status !== 'open') throw new Error('Đợt bỏ phiếu phụ đã đóng.')
        if (!currentRunoff.endsAt?.toMillis || currentRunoff.endsAt.toMillis() <= Date.now()) throw new Error('Đã hết hạn bỏ phiếu phụ.')
        if (selected.some(id => !currentRunoff.candidateIds?.includes(id))) throw new Error('Nhóm ứng viên đã thay đổi. Hãy tải lại trang.')
        transaction.set(ballotRef, {
          voterId: profile.voterId,
          voterName: profile.name || '',
          candidateIds: selected,
          submittedAt: serverTimestamp(),
        })
        transaction.update(runoffRef, { votedCount: (currentRunoff.votedCount || 0) + 1 })
      })
      setRunoffVoted(true)
      setSelected([])
      notify('Phiếu phụ đã được ghi nhận. Phiếu vòng 1 vẫn được giữ nguyên.')
      setTab('dashboard')
    } catch (error) {
      notify(error.code === 'permission-denied' ? 'Firestore Rules chưa cho phép gửi phiếu phụ. Admin cần triển khai Rules mới.' : error.message || 'Không gửi được phiếu phụ.')
    }
  }
  const submitBallot = async () => {
    if (activeRunoff) return submitRunoffBallot()
    if (selected.length !== maxSelection) return notify(`Vui lòng chọn đủ ${maxSelection} người trước khi xác nhận.`)
    if (election?.status !== 'open' || election?.activeRound !== round || votedRounds[round]) return notify('Vòng này hiện không nhận thêm phiếu.')
    const voterId = profile?.voterId
    if (!voterId) return notify('Hồ sơ đăng nhập chưa gắn với mã Huynh trưởng. Hãy đăng xuất và đăng nhập lại bằng mã được cấp.')
    const electionRef = doc(db, 'elections', electionId)
    const ballotRef = doc(db, 'elections', electionId, 'ballots', `${round}_${voterId}`)
    try {
      await runTransaction(db, async transaction => {
        const [electionSnap, ballotSnap] = await Promise.all([transaction.get(electionRef), transaction.get(ballotRef)])
        if (!electionSnap.exists()) throw new Error('Admin chưa tạo kỳ bầu cử.')
        if (ballotSnap.exists()) throw new Error('Bạn đã bỏ phiếu ở vòng này.')
        const currentElection = electionSnap.data()
        if (currentElection.status !== 'open' || currentElection.activeRound !== round) throw new Error('Vòng bầu cử hiện không mở.')
        if (currentElection.endsAt?.toMillis && currentElection.endsAt.toMillis() <= Date.now()) throw new Error('Đã hết thời gian bỏ phiếu.')
        const allowedIds = currentElection[`round${round}CandidateIds`]
        if (!Array.isArray(allowedIds) || !allowedIds.length || selected.some(id => !allowedIds.includes(id))) {
          throw new Error(`Vòng ${round} chưa lưu đúng danh sách ứng viên. Admin cần đóng rồi mở lại vòng ${round}; phiếu chưa được ghi.`)
        }
        transaction.set(ballotRef, {
          round,
          voterId,
          voterName: profile.name || '',
          candidateIds: selected,
          submittedAt: serverTimestamp(),
        })
        transaction.update(electionRef, { [`round${round}VotedCount`]: (currentElection[`round${round}VotedCount`] || 0) + 1 })
      })
      setVotedRounds(current => ({ ...current, [round]: true }))
      notify(`Phiếu vòng ${round} đã được ghi nhận thành công.`)
      setTab('dashboard')
    } catch (error) {
      const message = error.code === 'permission-denied'
        ? 'Firestore từ chối phiếu. Admin cần deploy Rules mới và đóng/mở lại vòng để lưu danh sách ứng viên hiện tại.'
        : error.message || 'Không gửi được phiếu bầu.'
      notify(message)
    }
  }
  const saveRoleAssignments = async () => {
    if (!isAdmin) return notify('Chỉ admin đoàn mới có quyền lưu phân công.')
    try {
      await updateDoc(doc(db, 'elections', electionId), { roles: roleAssignments })
      notify('Đã lưu phân công lên Firebase.')
    } catch (error) { notify(`Không lưu được phân công: ${error.message}`) }
  }
  useEffect(() => {
    setElectionForm({
      name: election?.name || '',
      term: election?.term || '',
      description: election?.description || '',
      endsAt: toBkkDateTimeInput(election?.endsAt),
      round1Seats: String(election?.round1Seats || 11),
      round2Seats: String(election?.round2Seats || 5),
    })
  }, [election?.name, election?.term, election?.description, election?.endsAt, election?.round1Seats, election?.round2Seats])
  const electionSettingsPayload = () => {
    const endsAt = fromBkkDateTimeInput(electionForm.endsAt)
    const configuredRound1Seats = Number(electionForm.round1Seats)
    const configuredRound2Seats = Number(electionForm.round2Seats)
    if (!electionForm.name.trim()) { notify('Vui lòng nhập tên kỳ bầu cử.'); return null }
    if (!electionForm.term.trim()) { notify('Vui lòng nhập nhiệm kỳ.'); return null }
    if (!Number.isInteger(configuredRound1Seats) || configuredRound1Seats < 1 || configuredRound1Seats > 200) { notify('Số người được bầu vòng 1 phải từ 1 đến 200.'); return null }
    if (!Number.isInteger(configuredRound2Seats) || configuredRound2Seats < 1 || configuredRound2Seats > configuredRound1Seats) { notify(`Số người được bầu vòng 2 phải từ 1 đến ${configuredRound1Seats}.`); return null }
    if (!endsAt || endsAt.toMillis() <= Date.now()) { notify('Hạn bầu cử phải là thời điểm trong tương lai.'); return null }
    return {
      name: electionForm.name.trim(),
      term: electionForm.term.trim(),
      description: electionForm.description.trim(),
      endsAt,
      round1Seats: configuredRound1Seats,
      round2Seats: configuredRound2Seats,
      voterCount: rosterMembers.length,
    }
  }
  const saveElectionConfiguration = async () => {
    if (!isAdmin) return notify('Chỉ admin đoàn mới được cấu hình kỳ bầu cử.')
    if (election?.status === 'open') return notify('Hãy đóng vòng đang mở trước khi sửa cấu hình.')
    if (electionHistoryLocked) return notify('Kỳ này đã có phiếu hoặc kết quả. Hãy tạo kỳ mới để giữ nguyên dữ liệu lịch sử.')
    if (activeRunoff || runoffs.length) return notify('Kỳ này đã có dữ liệu vòng phụ. Hãy tạo kỳ mới để giữ nguyên lịch sử.')
    const payload = electionSettingsPayload()
    if (!payload) return
    setSavingElection(true)
    try {
      const existingBallots = await getDocs(collection(db, 'elections', electionId, 'ballots'))
      const legacyBallots = await getDocs(collectionGroup(db, 'rounds'))
      if (!existingBallots.empty || legacyBallots.docs.some(ballot=>ballot.ref.parent.parent?.id===electionId)) return notify('Kỳ này đã có phiếu. Hãy tạo kỳ mới để giữ nguyên dữ liệu lịch sử.')
      await setDoc(doc(db, 'elections', electionId), {
        ...payload,
        status: election?.status || 'closed',
        activeRound: election?.activeRound || 1,
        round1VotedCount: election?.round1VotedCount || 0,
        round2VotedCount: election?.round2VotedCount || 0,
      }, { merge: true })
      notify('Đã lưu cấu hình nhiệm kỳ lên Firebase.')
    } catch (error) { notify(`Không lưu được cấu hình: ${error.message}`) }
    finally { setSavingElection(false) }
  }
  const switchElection = async nextId => {
    if (!isAdmin) return notify('Chỉ admin đoàn mới được chọn kỳ bầu cử đang hoạt động.')
    if (election?.status === 'open') return notify('Không thể chuyển kỳ khi một vòng bầu cử đang mở.')
    if (!nextId || nextId === electionId) return
    try {
      await setDoc(doc(db, 'appSettings', 'activeElection'), { electionId: nextId, updatedAt: serverTimestamp() })
      setElectionId(nextId)
      setRound(1)
      setSelected([])
      notify(`Đã chuyển sang kỳ ${electionRecords.find(item=>item.id===nextId)?.term || nextId}.`)
    } catch (error) { notify(`Không chuyển được kỳ bầu cử: ${error.message}`) }
  }
  const createElection = async () => {
    if (!isAdmin) return notify('Chỉ admin đoàn mới được tạo kỳ bầu cử.')
    if (election?.status === 'open') return notify('Hãy đóng vòng đang mở trước khi tạo kỳ mới.')
    if (!window.confirm('Tạo một kỳ bầu cử mới? Kỳ hiện tại và toàn bộ phiếu/kết quả của kỳ đó sẽ được giữ nguyên. Bạn sẽ nhập tên và nhiệm kỳ sau khi tạo.')) return
    setCreatingElection(true)
    try {
      const createdRef = doc(collection(db, 'elections'))
      const batch = writeBatch(db)
      batch.set(createdRef, {
        name: 'Bầu chọn Ban điều hành Xứ đoàn',
        term: '',
        description: '',
        endsAt: null,
        voterCount: rosterMembers.length,
        status: 'closed',
        activeRound: 1,
        round1VotedCount: 0,
        round2VotedCount: 0,
        createdAt: serverTimestamp(),
      })
      batch.set(doc(db, 'appSettings', 'activeElection'), { electionId: createdRef.id, updatedAt: serverTimestamp() })
      await batch.commit()
      setElectionId(createdRef.id)
      setRound(1)
      setSelected([])
      notify('Đã tạo kỳ mới. Hãy chọn HDT đủ điều kiện ứng cử trước khi mở vòng 1.')
    } catch (error) { notify(`Không tạo được kỳ bầu cử mới: ${error.message}`) }
    finally { setCreatingElection(false) }
  }
  const openCandidatePicker = () => {
    if (!isAdmin) return notify('Chỉ admin đoàn mới được chọn ứng viên.')
    if (election?.status === 'open' || electionHistoryLocked) return notify('Danh sách ứng viên đã khóa vì kỳ này đã bắt đầu.')
    if (!rosterMembers.length) return notify('Trước tiên hãy thêm HDT vào mục Danh sách HDT.')
    const rosterIds=new Set(rosterMembers.map(person=>person.id))
    setCandidatePickerSelected(candidates.filter(person=>person.active!==false&&rosterIds.has(person.id)).map(person=>person.id))
    setCandidatePickerSearch('')
    setShowCandidatePicker(true)
  }
  const saveCandidateSelection = async () => {
    if (!isAdmin) return notify('Chỉ admin đoàn mới được lưu danh sách ứng viên.')
    if (election?.status === 'open' || electionHistoryLocked) return notify('Danh sách ứng viên đã khóa vì kỳ này đã bắt đầu.')
    const selectedIds = new Set(candidatePickerSelected)
    if (!selectedIds.size) return notify('Chọn ít nhất một Huynh trưởng đủ điều kiện ứng cử.')
    const candidateById = new Map(candidates.map(person=>[person.id,person]))
    const writes = []
    rosterMembers.forEach(person=>{
      const existing = candidateById.get(person.id)
      if (selectedIds.has(person.id)) {
        writes.push({id:person.id,data:{name:person.name,sector:person.sector,active:true,electedRound1:existing?.elected===true}})
      } else if (existing?.active !== false) writes.push({id:person.id,data:{active:false,electedRound1:false}})
    })
    candidates.filter(person=>!rosterMembers.some(roster=>roster.id===person.id)&&person.active!==false).forEach(person=>writes.push({id:person.id,data:{active:false,electedRound1:false}}))
    setSyncingCandidates(true)
    try {
      for (let offset=0;offset<writes.length;offset+=450) {
        const batch=writeBatch(db)
        writes.slice(offset,offset+450).forEach(item=>batch.set(doc(db,'elections',electionId,'candidates',item.id),item.data,{merge:true}))
        await batch.commit()
      }
      setShowCandidatePicker(false)
      notify(`Đã lưu ${selectedIds.size} HDT vào danh sách ứng viên vòng 1.`)
    } catch (error) { notify(`Không lưu được danh sách ứng viên: ${error.message}`) }
    finally { setSyncingCandidates(false) }
  }
  const toggleCandidate = async person => {
    if (election?.status === 'open') return notify('Hãy đóng vòng bầu cử trước khi thay đổi danh sách ứng viên.')
    const current = candidates.find(candidate => candidate.id === person.id)
    try {
      if (current) {
        const active = current.active === false
        await updateDoc(doc(db, 'elections', electionId, 'candidates', person.id), { active, ...(active ? {} : { electedRound1: false }) })
      }
      else await setDoc(doc(db, 'elections', electionId, 'candidates', person.id), { name: person.name, sector: person.sector, active: true, electedRound1: false })
    } catch (error) { notify(`Không cập nhật được ứng viên: ${error.message}`) }
  }
  const toggleElectedCandidate = async candidate => {
    if (election?.status === 'open' || election?.activeRound !== 1 || election?.round1Finalized) return notify('Chỉ được chọn người trúng cử sau khi đóng vòng 1 và trước khi chốt kết quả.')
    try {
      await updateDoc(doc(db, 'elections', electionId, 'candidates', candidate.id), { electedRound1: !candidate.elected })
    } catch (error) { notify(`Không cập nhật được kết quả ứng viên: ${error.message}`) }
  }
  const finalizeRound1 = async () => {
    if (!isAdmin) return notify('Chỉ admin đoàn mới được chốt kết quả.')
    if (election?.status === 'open' || election?.activeRound !== 1) return notify('Hãy đóng vòng 1 trước khi chốt kết quả.')
    if (election?.round1Finalized) return notify('Kết quả vòng 1 đã được chốt.')
    if (runoffs.some(item=>item.status==='open')) return notify('Hãy đóng đợt vòng phụ đang mở trước khi chốt vòng 1.')
    if (runoffs.some(item=>!item.finalized)) return notify('Hãy chốt kết quả tất cả các vòng phụ trước khi chốt vòng 1.')
    const winnerIds = candidates.filter(person=>person.active!==false&&person.elected).map(person=>person.id)
    if (winnerIds.length !== round1Seats) return notify(`Đánh dấu đúng ${round1Seats} người trúng cử vòng 1 (hiện có ${winnerIds.length}).`)
    if (!window.confirm(`Chốt danh sách ${round1Seats} người trúng cử vòng 1? Sau khi chốt sẽ mở quyền chuyển sang vòng 2.`)) return
    setFinalizingRound1(true)
    try {
      await updateDoc(doc(db,'elections',electionId),{
        round1WinnerIds:winnerIds,
        round1Finalized:true,
        round1FinalizedAt:serverTimestamp(),
      })
      notify(`Đã chốt ${round1Seats} người trúng cử vòng 1.`)
    } catch (error) { notify(`Không chốt được kết quả vòng 1: ${error.message}`) }
    finally { setFinalizingRound1(false) }
  }
  const openElectionRound1 = async () => {
    if (election?.status === 'open') return notify('Một vòng bầu cử đang mở.')
    if (activeRunoff) return notify('Hãy đóng vòng phụ đang mở trước khi mở lại vòng chính.')
    if (electionHistoryLocked) return notify('Kỳ này đã bắt đầu hoặc có kết quả. Hãy tạo kỳ mới để bảo toàn lịch sử.')
    const payload = electionSettingsPayload()
    if (!payload) return
    const activeCandidates = candidates.filter(candidate => candidate.active !== false)
    if (payload.voterCount < payload.round1Seats || activeCandidates.length < payload.round1Seats) return notify(`Cần ít nhất ${payload.round1Seats} HDT và ${payload.round1Seats} ứng viên đang hoạt động để mở vòng 1.`)
    if (!window.confirm(`Mở vòng 1 cho ${payload.voterCount} HDT?`)) return
    setSavingElection(true)
    try {
      await setDoc(doc(db, 'elections', electionId), {
        ...payload,
        status: 'open',
        activeRound: 1,
        round1CandidateIds: activeCandidates.map(candidate => candidate.id),
        round1VotedCount: election?.round1VotedCount || 0,
        round2VotedCount: election?.round2VotedCount || 0,
      }, { merge: true })
      setRound(1)
      notify('Đã mở vòng 1.')
    } catch (error) { notify(`Không mở được vòng 1: ${error.message}`) }
    finally { setSavingElection(false) }
  }
  const closeElectionRound = async () => {
    if (election?.status !== 'open') return notify('Hiện không có vòng nào đang mở.')
    if (!window.confirm(`Đóng vòng ${election.activeRound}?`)) return
    setSavingElection(true)
    try {
      await updateDoc(doc(db, 'elections', electionId), { status: 'closed' })
      notify(`Đã đóng vòng ${election.activeRound}.`)
    } catch (error) { notify(`Không đóng được vòng: ${error.message}`) }
    finally { setSavingElection(false) }
  }
  const openElectionRound2 = async () => {
    if (election?.status === 'open') return notify('Hãy đóng vòng hiện tại trước.')
    if (activeRunoff) return notify('Hãy đóng vòng phụ đang mở trước khi mở vòng 2.')
    if (election?.activeRound !== 1) return notify('Kỳ bầu cử chưa ở bước chuyển từ vòng 1 sang vòng 2.')
    const payload = electionSettingsPayload()
    if (!payload) return
    if (!election?.round1Finalized) return notify('Hãy chốt kết quả vòng 1 trước khi mở vòng 2.')
    const winnerIds = election?.round1WinnerIds || candidates.filter(candidate => candidate.active !== false && candidate.elected).map(candidate=>candidate.id)
    if (winnerIds.length !== payload.round1Seats) return notify(`Danh sách chốt vòng 1 phải có đúng ${payload.round1Seats} người.`)
    if (!window.confirm(`Mở vòng 2 để HDT bầu ${payload.round2Seats} thành viên Ban Thường vụ?`)) return
    setSavingElection(true)
    try {
      await setDoc(doc(db, 'elections', electionId), {
        ...payload,
        status: 'open',
        activeRound: 2,
        round2CandidateIds: winnerIds,
        round1VotedCount: election?.round1VotedCount || 0,
        round2VotedCount: election?.round2VotedCount || 0,
        round1Finalized: true,
        round2WinnerIds: [],
        round2Finalized: false,
      }, { merge: true })
      setRound(2)
      notify('Đã mở vòng 2.')
    } catch (error) { notify(`Không mở được vòng 2: ${error.message}`) }
    finally { setSavingElection(false) }
  }
  const publishRoundResults = async targetRound => {
    if (!isAdmin) return notify('Chỉ admin đoàn mới được tổng hợp kết quả.')
    if (election?.status === 'open') return notify('Hãy đóng vòng trước khi tổng hợp kết quả.')
    setPublishingResults(true)
    try {
      const [ballotSnapshot, candidateSnapshot, legacySnapshot] = await Promise.all([
        getDocs(collection(db, 'elections', electionId, 'ballots')),
        getDocs(collection(db, 'elections', electionId, 'candidates')),
        getDocs(collectionGroup(db, 'rounds')),
      ])
      const totals = {};
      [...ballotSnapshot.docs, ...legacySnapshot.docs].forEach(ballot => {
        if (ballot.ref.parent.parent?.id && ballot.ref.parent.parent.id !== electionId) return
        const data = ballot.data()
        if (data.round === targetRound && data.voterId && Array.isArray(data.candidateIds)) new Set(data.candidateIds).forEach(id => { totals[id] = (totals[id] || 0) + 1 })
      })
      const batch = writeBatch(db)
      candidateSnapshot.docs.forEach(candidate => {
        batch.set(doc(db, 'elections', electionId, 'tallies', `round${targetRound}`, 'candidates', candidate.id), {
          candidateId: candidate.id,
          votes: totals[candidate.id] || 0,
          updatedAt: serverTimestamp(),
        })
      })
      await batch.commit()
      notify(`Đã tổng hợp ${Object.values(totals).reduce((sum, count) => sum + count, 0)} lượt chọn vào kết quả vòng ${targetRound}.`)
    } catch (error) { notify(`Không tổng hợp được kết quả: ${error.message}`) }
    finally { setPublishingResults(false) }
  }
  const finalizeRound2 = async () => {
    if (!isAdmin) return notify('Chỉ admin đoàn mới được chốt kết quả.')
    if (election?.status === 'open' || election?.activeRound !== 2) return notify('Hãy đóng vòng 2 trước khi chốt kết quả.')
    if (runoffs.some(item => (item.sourceRound || 1) === 2 && !item.finalized)) return notify('Hãy chốt tất cả vòng phụ vòng 2 trước khi chốt danh sách Ban Thường vụ.')
    const allowedIds = election?.round2CandidateIds || candidates.filter(person=>person.elected).map(person=>person.id)
    if (round2Winners.length !== round2Seats) return notify(`Chọn đúng ${round2Seats} người vào Ban Thường vụ trước khi chốt.`)
    if (round2Winners.some(id=>!allowedIds.includes(id))) return notify(`Danh sách đã thay đổi. Hãy kiểm tra lại ${round2Seats} lựa chọn.`)
    const confirmText = election.round2Finalized
      ? `Cập nhật lại danh sách ${round2Seats} người Ban Thường vụ? Phiếu và số phiếu vòng 2 sẽ không thay đổi.`
      : `Chốt ${round2Winners.length} người trúng cử Ban Thường vụ? Phiếu và số phiếu vòng 2 sẽ không thay đổi.`
    if (!window.confirm(confirmText)) return
    setFinalizingRound2(true)
    try {
      await updateDoc(doc(db, 'elections', electionId), {
        round2WinnerIds: round2Winners,
        round2Finalized: true,
        round2FinalizedAt: serverTimestamp(),
      })
      notify(`Đã chốt danh sách ${round2Seats} người Ban Thường vụ. Phiếu vòng 2 được giữ nguyên.`)
    } catch (error) { notify(`Không chốt được kết quả vòng 2: ${error.message}`) }
    finally { setFinalizingRound2(false) }
  }
  const downloadElectionMinutes = () => {
    const exportedAt = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' }).format(new Date())
    const csvCell = value => {
      let text = String(value ?? '')
      if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`
      return `"${text.replace(/"/g, '""')}"`
    }
    const rows = [
      ['BIÊN BẢN KẾT QUẢ BẦU CỬ'],
      ['Đoàn', 'Đoàn Gioan Baotixita - Giáo xứ Bảo Sơn'],
      ['Nhiệm kỳ', election?.term || 'Chưa thiết lập'],
      ['Vòng', round],
      ['Thời điểm xuất', exportedAt],
      ['Tổng số HDT', voterCount],
      [`Đã bỏ phiếu vòng ${round}`, votedCount],
      [],
      ['Hạng', 'Họ và tên', 'Ngành', 'Số phiếu', 'Tỷ lệ trên tổng HDT', 'Kết quả'],
      ...ranked.map((person, index) => [index + 1, person.name, person.sector, person.votes, `${Math.round(person.votes / (voterCount || 1) * 100)}%`, resultStatus(person, index)]),
    ]
    if (resultRunoff?.status === 'closed') {
      const sourceRound = resultRunoff.sourceRound || 1
      const sourceRunoffTallies = runoffTalliesById[resultRunoff.id] || {}
      const runoffRows = (resultRunoff.candidateIds || []).map(id => candidates.find(person => person.id === id)).filter(Boolean).sort((a,b)=>(sourceRunoffTallies[b.id]||0)-(sourceRunoffTallies[a.id]||0)||String(a.name||'').localeCompare(String(b.name||''),'vi'))
      rows.push([], [`KẾT QUẢ VÒNG PHỤ ${sourceRound}`], ['Số suất cần chọn', resultRunoff.seats], ['HDT đã bỏ phiếu phụ', resultRunoff.votedCount || 0], ['Hạng', 'Họ và tên', 'Ngành', `Phiếu vòng ${sourceRound}`, 'Phiếu phụ', 'Kết quả phụ'])
      runoffRows.forEach((person,index)=>rows.push([index+1,person.name,person.sector,talliesByRound[sourceRound]?.[person.id]||0,sourceRunoffTallies[person.id]||0,resultRunoff.winnerIds?.includes(person.id)?'Trúng vòng phụ':resultRunoff.finalized?'Không trúng':'Chưa chốt']))
    }
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const termFileName = normalizeText(election?.term || 'nhiem-ky').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    link.href = url
    link.download = `bien-ban-bau-cu-${termFileName}-vong-${round}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify('Đã tải biên bản CSV. Có thể mở bằng Excel.')
  }
  useEffect(() => {
    setRunoffWinners(adminDisplayedRunoff?.winnerIds || [])
  }, [adminDisplayedRunoff?.id, adminDisplayedRunoff?.winnerIds])
  const createRunoff = async () => {
    if (!isAdmin) return notify('Chỉ admin đoàn mới được tạo vòng phụ.')
    if (election?.status === 'open') return notify('Hãy đóng vòng chính trước khi tạo vòng phụ.')
    const sourceRound = election?.activeRound
    if (![1,2].includes(sourceRound)) return notify('Kỳ bầu cử chưa ở vòng có thể tạo vòng phụ.')
    if (sourceRound === 2 && !election?.round1Finalized) return notify('Cần chốt kết quả vòng 1 trước khi xử lý vòng phụ vòng 2.')
    if ((sourceRound===1&&election?.round1Finalized)||(sourceRound===2&&election?.round2Finalized)) return notify(`Kết quả vòng ${sourceRound} đã chốt; không thể tạo thêm vòng phụ.`)
    if (activeRunoff) return notify('Đang có một đợt bỏ phiếu phụ mở.')
    const seats = Number(runoffSeats)
    const endsAt = fromBkkDateTimeInput(runoffEndsAt)
    const eligibleIds = sourceRound === 1 ? candidates.filter(person=>person.active!==false).map(person=>person.id) : (election?.round2CandidateIds || election?.round1WinnerIds || [])
    const selectedCandidates = candidates.filter(person => runoffCandidateIds.includes(person.id) && eligibleIds.includes(person.id) && person.active !== false)
    if (selectedCandidates.length < 2) return notify('Chọn ít nhất 2 ứng viên đang hòa phiếu.')
    if (!Number.isInteger(seats) || seats < 1 || seats >= selectedCandidates.length) return notify('Số suất cần chọn phải từ 1 và nhỏ hơn số ứng viên được chọn.')
    if (!endsAt || endsAt.toMillis() <= Date.now()) return notify('Đặt hạn kết thúc vòng phụ trong tương lai.')
    if (!window.confirm(`Tạo vòng phụ riêng cho ${selectedCandidates.length} ứng viên vòng ${sourceRound}, chọn ${seats} người? Phiếu gốc vòng ${sourceRound} sẽ được giữ nguyên.`)) return
    setSavingRunoff(true)
    try {
      const runoffRef = await addDoc(collection(db, 'elections', electionId, 'runoffs'), {
        sourceRound,
        candidateIds: selectedCandidates.map(person => person.id),
        seats,
        status: 'open',
        voterCount: rosterMembers.length,
        votedCount: 0,
        endsAt,
        createdAt: serverTimestamp(),
        createdBy: authUser.uid,
      })
      setRunoffCandidateIds([])
      setRunoffSeats('1')
      setRunoffEndsAt('')
      notify(`Đã tạo vòng phụ vòng ${sourceRound} (${runoffRef.id}). Phiếu gốc được giữ nguyên.`)
    } catch (error) { notify(`Không tạo được vòng phụ: ${error.message}`) }
    finally { setSavingRunoff(false) }
  }
  const closeRunoff = async () => {
    if (!isAdmin || !activeRunoff) return
    if (!window.confirm('Đóng đợt bỏ phiếu phụ này? Phiếu đã gửi vẫn được giữ nguyên.')) return
    setSavingRunoff(true)
    try {
      await updateDoc(doc(db, 'elections', electionId, 'runoffs', activeRunoff.id), { status: 'closed', closedAt: serverTimestamp() })
      notify('Đã đóng vòng phụ. Hãy tổng hợp và kiểm tra số phiếu.')
    } catch (error) { notify(`Không đóng được vòng phụ: ${error.message}`) }
    finally { setSavingRunoff(false) }
  }
  const finalizeRunoff = async () => {
    if (!isAdmin || !displayedRunoff || displayedRunoff.status !== 'closed') return notify('Chỉ chốt kết quả sau khi đóng vòng phụ.')
    if (displayedRunoff.finalized) return notify('Vòng phụ này đã được chốt.')
    if (runoffWinners.length !== displayedRunoff.seats) return notify(`Chọn đúng ${displayedRunoff.seats} người thắng vòng phụ.`)
    const tiedIds = displayedRunoff.candidateIds || []
    const sourceRound = displayedRunoff.sourceRound || 1
    let round2FinalWinners = []
    if (sourceRound === 1) {
      const alreadyElectedOutsideTie = candidates.filter(person => person.elected && !tiedIds.includes(person.id)).length
      if (alreadyElectedOutsideTie + runoffWinners.length !== round1Seats) return notify(`Sau khi chốt sẽ có ${alreadyElectedOutsideTie + runoffWinners.length}/${round1Seats} người. Hãy kiểm tra nhóm không hòa và số suất vòng phụ.`)
    } else {
      const allowedIds = election?.round2CandidateIds || election?.round1WinnerIds || []
      if (runoffWinners.some(id=>!tiedIds.includes(id)||!allowedIds.includes(id))) return notify('Danh sách vòng phụ không khớp ứng viên vòng 2. Hãy tải lại trang.')
      const remainingSeats = round2Seats - runoffWinners.length
      const outsideTie = allowedIds.filter(id=>!tiedIds.includes(id)).map(id=>({id,votes:talliesByRound[2]?.[id]||0,name:candidates.find(person=>person.id===id)?.name||''})).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name,'vi')).slice(0,remainingSeats).map(person=>person.id)
      round2FinalWinners = [...outsideTie,...runoffWinners]
      if (round2FinalWinners.length !== round2Seats) return notify(`Sau khi chốt sẽ có ${round2FinalWinners.length}/${round2Seats} người Ban Thường vụ. Kiểm tra số suất vòng phụ.`)
    }
    if (!window.confirm(`Chốt ${runoffWinners.length} người thắng vòng phụ vòng ${sourceRound}? Phiếu và số phiếu gốc không thay đổi.`)) return
    setSavingRunoff(true)
    try {
      const batch = writeBatch(db)
      if (sourceRound === 1) tiedIds.forEach(candidateId => batch.update(doc(db, 'elections', electionId, 'candidates', candidateId), { electedRound1: runoffWinners.includes(candidateId) }))
      batch.update(doc(db, 'elections', electionId, 'runoffs', displayedRunoff.id), {
        winnerIds: runoffWinners,
        finalized: true,
        finalizedAt: serverTimestamp(),
      })
      if (sourceRound === 2) batch.update(doc(db,'elections',electionId),{round2WinnerIds:round2FinalWinners,round2Finalized:true,round2FinalizedAt:serverTimestamp()})
      await batch.commit()
      notify(`Đã chốt vòng phụ ${sourceRound}; kết quả phiếu gốc được giữ nguyên.`)
    } catch (error) { notify(`Không chốt được kết quả vòng phụ: ${error.message}`) }
    finally { setSavingRunoff(false) }
  }
  const nav = [
    { key: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { key: 'vote', label: 'Bầu chọn', icon: Vote, dot: true },
    { key: 'results', label: 'Kết quả', icon: ClipboardList },
    ...(isAdmin ? [{ key: 'election', label: 'Kỳ bầu cử', icon: CalendarDays }] : []),
    ...(isAdmin ? [{ key: 'members', label: 'Danh sách HDT', icon: Users }, { key: 'roles', label: 'Phân chức vụ', icon: SlidersHorizontal }] : []),
  ]
  if (!firebaseConfigured || !auth || !db) return <div className="setup-screen"><section className="panel setup-card"><div className="brand-mark">✳</div><h1>Cần cấu hình Firebase</h1><p>Ứng dụng hiện chưa kết nối dự án Firebase nên không hiển thị dữ liệu mẫu hoặc nhận phiếu bầu.</p><p>Điền cấu hình ứng dụng Web trong <code>.env.local</code>, sau đó bật Authentication và Firestore.</p><small>Xem hướng dẫn thiết lập trong README.md</small></section></div>
  if (!authReady) return <div className="setup-screen"><section className="panel setup-card"><h1>Đang kiểm tra đăng nhập…</h1></section></div>
  if (!profile?.active && (!authUser || authUser.isAnonymous)) return <div className="setup-screen"><section className="panel setup-card"><div className="brand-mark">✳</div><h1>Đăng nhập cổng bầu chọn</h1><p>Nhập mã đăng nhập do admin đoàn cấp. Mỗi mã dùng một lần và có thể sử dụng trong 4 giờ kể từ lúc cấp.</p><form className="login-method" onSubmit={loginWithCode}><b>Mã đăng nhập Huynh trưởng</b><input className="login-input access-code-input" aria-label="Mã đăng nhập" autoComplete="one-time-code" maxLength={14} value={loginCode} onChange={event=>setLoginCode(event.target.value.toUpperCase())} placeholder="ABCD-EFGH-JKLM"/><button className="primary-button" disabled={loggingInWithCode}>{loggingInWithCode?'Đang xác thực…':'Đăng nhập bằng mã'}</button></form><div className="login-divider">Admin đoàn</div><button className="outline-button login-google" onClick={signInGoogle}>Đăng nhập bằng Google</button><small className="login-footnote">Không cần SMS hoặc tài khoản Google để bỏ phiếu. Sau khi mã được dùng, thiết bị này sẽ giữ phiên đăng nhập.</small>{notice&&<small className="setup-error">{notice}</small>}</section></div>
  if (!profile?.active) return <div className="setup-screen"><section className="panel setup-card"><div className="brand-mark">✳</div><h1>Tài khoản chưa được duyệt</h1><p>{authUser.email || 'Tài khoản Google này'} chưa có quyền quản trị. HDT hãy đăng xuất rồi nhập mã do admin cấp.</p><button className="outline-button" onClick={logout}><LogOut size={16}/> Đăng xuất</button></section></div>
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
        <button className="profile" onClick={logout}><Avatar person={{ initials: (profile.name || authUser.displayName || authUser.email || 'H').split(/\s+/).slice(-2).map(x=>x[0]).join('').toUpperCase(), color: 'olive' }}/><span><b>{profile.name || authUser.displayName || authUser.email}</b><small>{profile.title || profile.sector || 'Huynh trưởng'}</small></span><LogOut size={15}/></button>
      </div>
    </aside>
    {menuOpen && <button className="scrim" aria-label="Đóng menu" onClick={() => setMenuOpen(false)}/>}
    <main className="main-area">
      <header className="topbar"><div className="crumb"><button className="hamburger" onClick={() => setMenuOpen(true)}><Menu size={20}/></button><span>Cổng thông tin</span><ChevronRight size={15}/><b>{nav.find(item => item.key === tab)?.label || 'Tổng quan'}</b></div><div className="top-actions"><span className="cycle-pill"><i/> {activeRunoff ? 'ĐANG BỎ PHIẾU PHỤ' : election?.status === 'open' ? 'ĐANG DIỄN RA' : 'CHƯA MỞ'}</span><button className="icon-button" onClick={() => notify('Bạn không có thông báo mới.')}><Bell size={18}/></button><div className="top-divider"/><button className="top-profile" onClick={logout}><Avatar person={{ initials: (profile.name || authUser.displayName || 'H').split(/\s+/).slice(-2).map(x=>x[0]).join('').toUpperCase(), color: 'olive' }} size="small"/><ChevronDown size={14}/></button></div></header>
      <div className="content">
        <div className="welcome-line"><div><div className="eyebrow"><span>✳</span> ĐOÀN GIOAN BAOTIXITA · GIÁO XỨ BẢO SƠN</div><h1>{tab === 'dashboard' ? `Xin chào, ${profile.name || authUser.displayName || 'Huynh trưởng'}` : tab === 'vote' ? 'Phiếu bầu của bạn' : tab === 'results' ? 'Kết quả bầu chọn' : tab === 'roles' ? 'Phân công chức vụ' : tab === 'election' ? 'Cấu hình kỳ bầu cử' : 'Danh sách Huynh trưởng'} <span className="wave">✦</span></h1><p>Dữ liệu bầu cử được cập nhật trực tiếp từ Firebase.</p></div><button className="help-button" onClick={() => notify('Liên hệ admin đoàn để được hỗ trợ.')}><CircleHelp size={16}/> Hướng dẫn bầu chọn</button></div>
        <div className="election-banner"><div className="banner-pattern"/><div className="banner-icon"><Vote size={21}/></div><div className="banner-copy"><span className="banner-kicker">KỲ BẦU CỬ · {election?.term || 'Nhiệm kỳ chưa thiết lập'}</span><b>{election?.name || 'Bầu chọn Ban điều hành Xứ đoàn'}</b><span>{election?.description || 'Theo dõi kỳ bầu cử được cấu hình bởi admin đoàn.'}</span></div><div className="banner-separator"/><div className="banner-deadline"><span>TRẠNG THÁI</span><b>{activeRunoff ? 'Vòng phụ' : election?.status === 'open' ? `Vòng ${election.activeRound}` : 'Chưa mở'}</b><span>{(activeRunoff?.endsAt || election?.endsAt)?.toDate ? `Kết thúc ${(activeRunoff?.endsAt || election.endsAt).toDate().toLocaleString('vi-VN')}` : 'Chưa đặt thời hạn'}</span></div><button className="banner-cta" onClick={() => { setTab('vote'); setSelected([]) }} disabled={activeRunoff ? runoffVoted : election?.status !== 'open' || votedRounds[election?.activeRound]}> {activeRunoff ? runoffVoted ? 'Đã bỏ phiếu phụ' : 'Bỏ phiếu phụ' : election?.status === 'open' ? votedRounds[election.activeRound] ? 'Đã bỏ phiếu' : 'Bắt đầu bầu chọn' : 'Chờ kỳ bầu cử'} <ArrowUpRight size={16}/></button></div>
        {tab === 'election' && isAdmin && <>
          <ElectionAdminPanel
            form={electionForm} setForm={setElectionForm} election={election}
            electionRecords={electionRecords} electionId={electionId} onSwitchElection={switchElection} onCreateElection={createElection} creatingElection={creatingElection}
            historyLocked={electionHistoryLocked}
            rosterMembers={rosterMembers} candidates={candidates} runoffs={runoffs} round2Tallies={talliesByRound[2]||{}}
            round2Winners={round2Winners} setRound2Winners={setRound2Winners} onFinalizeRound2={finalizeRound2} finalizingRound2={finalizingRound2}
            saving={savingElection} syncing={syncingCandidates}
            onSave={saveElectionConfiguration} onOpenCandidatePicker={openCandidatePicker} onSaveCandidateSelection={saveCandidateSelection}
            onToggleCandidate={toggleCandidate} onToggleElected={toggleElectedCandidate}
            onOpenRound1={openElectionRound1} onFinalizeRound1={finalizeRound1} finalizingRound1={finalizingRound1} onOpenRound2={openElectionRound2}
            onCloseRound={closeElectionRound} onPublishResults={publishRoundResults}
            publishingResults={publishingResults} round1Tallies={talliesByRound[1] || {}}
            round1Seats={round1Seats} round2Seats={round2Seats}
          />
          <RunoffAdminPanel
            candidates={candidates} tallies={talliesByRound[1] || {}}
            runoffTallies={adminRunoffTallies} activeRunoff={activeRunoff} displayedRunoff={adminDisplayedRunoff}
            selectedIds={runoffCandidateIds} setSelectedIds={setRunoffCandidateIds}
            seats={runoffSeats} setSeats={setRunoffSeats} endsAt={runoffEndsAt} setEndsAt={setRunoffEndsAt}
            winners={runoffWinners} setWinners={setRunoffWinners}
            rosterCount={rosterMembers.length} round1Seats={round1Seats} round2Seats={round2Seats} electionRound={election?.activeRound||1} round2CandidateIds={election?.round2CandidateIds||[]} round2Tallies={talliesByRound[2]||{}} isElectionOpen={election?.status==='open'} resultFinalized={election?.activeRound===2?election?.round2Finalized:election?.round1Finalized} saving={savingRunoff}
            onCreate={createRunoff} onClose={closeRunoff} onFinalize={finalizeRunoff}
          />
        </>}
        {tab === 'dashboard' && <>
          <div className="section-heading"><div><h2>Tổng quan bầu cử</h2><p>Theo dõi tiến độ và thông tin kỳ bầu cử hiện tại</p></div><button className="date-filter">◷ <span>Toàn bộ thời gian</span><ChevronDown size={14}/></button></div>
          <div className="stat-grid"><StatCard icon={<Users size={18}/>} tint="purple" label="Tổng số Huynh trưởng" value={voterCount} note="Theo danh sách cử tri"/><StatCard icon={<Vote size={18}/>} tint="green" label={`Đã tham gia vòng ${round}`} value={votedCount} suffix={` / ${voterCount}`} progress={pct} note={`${pct}% cử tri đã bỏ phiếu`}/><StatCard icon={<Clock3 size={18}/>} tint="orange" label="Vòng đang mở" value={election?.activeRound ? `Vòng ${election.activeRound}` : 'Chưa mở'} note={election?.status === 'open' ? 'Đang nhận phiếu' : 'Chờ admin mở kỳ bầu cử'}/><StatCard icon={<ShieldCheck size={18}/>} tint="blue" label="Trạng thái kỳ bầu cử" value={election?.status === 'open' ? 'Đang mở' : 'Đã đóng'} badge/> </div>
          <div className="mid-grid"><section className="panel progress-panel"><PanelTitle title="Tiến độ bầu cử" subtitle="Tình trạng tham gia theo từng vòng" action="Chi tiết" onAction={() => setTab('results')}/>{[1,2].map(r=>{const count=election?.[`round${r}VotedCount`]||0;const progress=voterCount?Math.round(count/voterCount*100):0;return <div className="round-progress" key={r}><div className={`round-icon ${election?.activeRound===r?'green-round':'gray-round'}`}>{r===1?<Check size={17}/>:<Vote size={17}/>}</div><div className="round-info"><div><b>Vòng {r} · {r===1?`Bầu chọn ${round1Seats} thành viên`:`Bầu chọn ${round2Seats} thành viên`}</b><span className={`status-chip ${election?.activeRound===r?'done':'pending'}`}>{election?.activeRound===r?'ĐANG DIỄN RA':count?'ĐÃ ĐÓNG':'CHƯA MỞ'}</span></div><p>{r===1?`Chọn ${round1Seats} Huynh trưởng vào Ban điều hành`:`Bầu ${round2Seats} thành viên từ danh sách ${round1Seats} người`}</p><ProgressBar value={progress} color={r===1?'green':'gray'}/><small>{count} <i>/ {voterCount} Huynh trưởng</i><b>{progress}%</b></small></div></div>})}<div className="panel-footer"><span><b>{votedCount} Huynh trưởng</b> đã bỏ phiếu vòng {round}</span><button onClick={() => setTab('results')}>Xem kết quả <ChevronRight size={15}/></button></div></section>
          <section className="panel activity-panel"><PanelTitle title="Trạng thái dữ liệu" subtitle="Cập nhật trực tiếp từ Firebase"/><div className="activity-list"><Activity color="purple" icon={<Users size={15}/>} title={`${candidates.length} ứng viên`} detail="Danh sách đồng bộ từ Firestore" time={loadingData?'Đang tải…':'Đang cập nhật trực tiếp'}/><Activity color="green" icon={<Vote size={15}/>} title={election?.status==='open'?`Vòng ${election.activeRound} đang mở`:'Kỳ bầu cử chưa mở'} detail="Trạng thái lấy từ tài liệu kỳ bầu cử" time="Firebase Firestore"/><Activity color="orange" icon={<ShieldCheck size={15}/>} title={isAdmin?'Quyền admin đoàn':'Tài khoản HDT'} detail="Quyền được đọc từ hồ sơ đã duyệt" time={authUser.email}/></div></section></div>
          <section className="panel winners-panel"><PanelTitle title="Danh sách đang dẫn đầu" subtitle={`Top ${round1Seats} Huynh trưởng có số phiếu cao nhất vòng 1`} action="Xem tất cả kết quả" onAction={() => setTab('results')}/><div className="table-wrap"><table><thead><tr><th>HẠNG</th><th>HUYNH TRƯỞNG</th><th>NGÀNH</th><th>SỐ PHIẾU</th><th>TỶ LỆ</th><th>TRẠNG THÁI</th></tr></thead><tbody>{ranked.slice(0,round1Seats).map((person,index)=><tr key={person.id}><td><span className={`rank ${index===0?'first':''}`}>{String(index+1).padStart(2,'0')}</span></td><td><div className="person-cell"><Avatar person={person} size="small"/><b>{person.name}</b></div></td><td><span className="sector-chip">{person.sector.replace('Ngành ','')}</span></td><td><b>{person.votes}</b> phiếu</td><td><span className="table-progress"><i style={{width:`${Math.round(person.votes/(ranked[0]?.votes || 1)*100)}%`}}/></span> {Math.round(person.votes/(voterCount || 1)*100)}%</td><td><span className="status-chip elected"><i/> Đang dẫn đầu</span></td></tr>)}</tbody></table></div></section>
        </>}
        {tab === 'vote' && <div className="vote-layout"><section className="panel ballot-panel"><div className="ballot-top"><div><span className="banner-kicker">{activeRunoff ? `PHIẾU PHỤ · VÒNG ${activeRunoff.sourceRound}` : `PHIẾU BẦU CỬ · VÒNG ${round}`}</span><h2>{activeRunoff ? `Chọn ${activeRunoff.seats} người trong nhóm hòa phiếu` : round === 1 ? `Chọn ${round1Seats} thành viên Ban điều hành` : `Chọn ${round2Seats} thành viên Ban Thường vụ`}</h2><p>{activeRunoff ? 'Đây là phiếu phụ riêng. Phiếu vòng 1 đã gửi không bị thay đổi.' : round === 1 ? `Chọn ${round1Seats} Huynh trưởng mà bạn tín nhiệm. Bạn có thể tự bầu cho mình.` : `Chọn ${round2Seats} người trong danh sách ${round1Seats} thành viên đã trúng cử.`}</p></div>{!activeRunoff && <div className="round-switch"><button className={round===1?'selected':''} onClick={() => {setRound(1);setSelected([])}}>Vòng 1</button><button className={round===2?'selected':''} onClick={() => {setRound(2);setSelected([])}}>Vòng 2</button></div>}</div><div className="ballot-toolbar"><label className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm kiếm Huynh trưởng..."/></label><button className="filter-button"><SlidersHorizontal size={15}/> Tất cả ngành <ChevronDown size={14}/></button><span className="selection-count">Đã chọn <b>{selected.length}</b> / {maxSelection}</span></div><div className="candidate-grid">{ballotCandidates.filter(person=>`${person.name} ${person.sector}`.toLowerCase().includes(query.toLowerCase())).map(person=><button key={person.id} className={`candidate-card ${selected.includes(person.id)?'chosen':''}`} onClick={()=>selectCandidate(person.id)}><Avatar person={person}/><span className="candidate-name"><b>{person.name}</b><small>{person.sector}</small></span><span className={`checkbox ${selected.includes(person.id)?'checked':''}`}>{selected.includes(person.id)&&<Check size={13}/>}</span></button>)}</div><div className="ballot-footer"><span><ShieldCheck size={16}/> Phiếu bầu của bạn được bảo mật</span><button className="primary-button" onClick={submitBallot}>Xác nhận {activeRunoff ? 'phiếu phụ' : 'phiếu bầu'} <ChevronRight size={16}/></button></div></section><aside className="panel ballot-aside"><div className="aside-icon"><ClipboardList size={20}/></div><h3>Hướng dẫn bỏ phiếu</h3><ol><li><span>1</span><p>Chọn đúng <b>{maxSelection} Huynh trưởng</b> mà bạn tín nhiệm.</p></li><li><span>2</span><p>Bạn có thể <b>tự chọn chính mình</b> trong danh sách.</p></li><li><span>3</span><p>Kiểm tra lựa chọn trước khi nhấn xác nhận.</p></li><li><span>4</span><p>Sau khi gửi, phiếu bầu <b>không thể chỉnh sửa</b>.</p></li></ol><div className="aside-note"><ShieldCheck size={15}/><span>{activeRunoff ? 'Mỗi HDT chỉ được gửi một phiếu cho đợt phụ này.' : 'Mỗi Huynh trưởng chỉ được bỏ phiếu một lần trong mỗi vòng.'}</span></div><div className="aside-deadline"><Clock3 size={16}/><span>Hạn bỏ phiếu<b>{(activeRunoff?.endsAt || election?.endsAt)?.toDate ? (activeRunoff?.endsAt || election.endsAt).toDate().toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok' }) : 'Chưa thiết lập'}</b></span></div></aside></div>}
        {tab === 'results' && <>
          <section className="panel results-panel"><div className="results-header"><div><span className="banner-kicker">KỲ BẦU CỬ · {election?.term || 'Nhiệm kỳ chưa thiết lập'}</span><h2>Kết quả vòng {round}</h2><p>Công khai đầy đủ số phiếu của từng ứng viên.</p></div><button className="outline-button" onClick={downloadElectionMinutes}><Download size={16}/> Tải biên bản CSV</button></div><div className="result-tabs"><button className={round===1?'selected':''} onClick={()=>setRound(1)}>Vòng 1 · Bầu {round1Seats} thành viên</button><button className={round===2?'selected':''} onClick={()=>setRound(2)}>Vòng 2 · Bầu {round2Seats}</button></div><div className="table-wrap"><table><thead><tr><th>HẠNG</th><th>HUYNH TRƯỞNG</th><th>NGÀNH</th><th>SỐ PHIẾU</th><th>TỶ LỆ PHIẾU</th><th>KẾT QUẢ</th></tr></thead><tbody>{ranked.map((person,index)=><tr key={person.id}><td><span className={`rank ${index<maxSelection?'first':''}`}>{String(index+1).padStart(2,'0')}</span></td><td><div className="person-cell"><Avatar person={person} size="small"/><b>{person.name}</b></div></td><td><span className="sector-chip">{person.sector.replace('Ngành ','')}</span></td><td><b>{person.votes}</b> phiếu</td><td><div className="result-vote"><ProgressBar value={Math.round(person.votes/(ranked[0]?.votes || 1)*100)} color={index<maxSelection?'green':'gray'}/><span>{Math.round(person.votes/(voterCount || 1)*100)}%</span></div></td><td><span className={`status-chip ${resultStatus(person,index)==="Trúng cử"||resultStatus(person,index)==="Đang dẫn đầu"?"elected":"pending"}`}>{resultStatus(person,index)}</span></td></tr>)}</tbody></table></div><div className="aside-note">Admin chốt danh sách trúng cử trong mục “Kỳ bầu cử” sau khi xử lý mọi trường hợp hòa phiếu.</div></section>
          {resultRunoff?.status==='closed'&&<RunoffPublicResults runoff={resultRunoff} candidates={candidates} originalTallies={talliesByRound[resultRunoff.sourceRound||1]||{}} runoffTallies={resultRunoffTallies}/>}
        </>}
        {tab === 'roles' && <section className="panel results-panel"><div className="results-header"><div><span className="banner-kicker">CƠ CẤU BAN ĐIỀU HÀNH</span><h2>Phân công chức vụ nhiệm kỳ</h2><p>Chức vụ được phân công theo cơ cấu hiện tại; danh sách thành viên lấy theo số ghế đã cấu hình cho từng vòng.</p></div><button className="primary-button" onClick={saveRoleAssignments}>Lưu phân công <Check size={15}/></button></div><div className="roles-grid">{roles.map((role,index)=>{const pool=index<5?ranked.filter(p=>p.elected).slice(0,round2Seats):ranked.filter(p=>p.elected).slice(round2Seats);return <div className="role-card" key={role.title}><div className={`role-symbol ${role.color}`}>{role.icon}</div><div className="role-detail"><span>{role.category}</span><b>{role.title}</b><select value={roleAssignments[role.title]||''} onChange={e=>setRoleAssignments({...roleAssignments,[role.title]:e.target.value})}><option value="">Chọn Huynh trưởng</option>{pool.map(person=><option value={person.id} key={person.id}>{person.name}</option>)}</select></div></div>})}</div><div className="aside-note"><ShieldCheck size={15}/> Phân công mẫu minh họa. Cần lưu xác nhận của Ban Thường vụ trước khi công bố.</div></section>}
    {tab === 'members' && <section className="panel results-panel"><div className="results-header"><div><span className="banner-kicker">DANH SÁCH CỬ TRI</span><h2>Huynh trưởng Xứ đoàn</h2><p>{rosterMembers.length} HDT đang hoạt động · {rosterRecords.length-rosterMembers.length} đã ngừng kích hoạt</p></div><div className="member-header-actions"><button className="outline-button" disabled={issuingCodes||!codeableMembers.length} onClick={()=>issueLoginCodes(codeableMembers)}>{issuingCodes?'Đang cấp mã…':`Cấp mã cho ${codeableMembers.length} HDT`}</button><button className="primary-button" onClick={()=>setShowAddMembers(true)}>+ Thêm HDT</button></div></div><div className="ballot-toolbar"><label className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm kiếm Huynh trưởng..."/></label><small>Mỗi mã dùng một lần, hết hạn sau 4 giờ.</small></div><div className="table-wrap"><table><thead><tr><th>HUYNH TRƯỞNG</th><th>NGÀNH</th><th>NGÀY SINH</th><th>TÀI KHOẢN</th><th>VÒNG 1</th><th>VÒNG 2</th><th>MÃ ĐĂNG NHẬP</th><th>TRẠNG THÁI</th></tr></thead><tbody>{memberRows.filter(person=>`${person.name||person.email||''} ${person.sector||''}`.toLowerCase().includes(query.toLowerCase())).map(person=><tr key={person.id}><td><div className="person-cell"><Avatar person={{...person,initials:person.initials||String(person.name||person.email||'?').split(/\s+/).slice(-2).map(x=>x[0]).join('').toUpperCase(),color:person.color||'mint'}} size="small"/><b>{person.name||person.email}</b></div></td><td><span className="sector-chip">{person.sector||'—'}</span></td><td>{person.birthDate?person.birthDate.split('-').reverse().join('/'):'—'}</td><td><span className={`status-chip ${person.active?'elected':'pending'}`}><i/> {person.active?'Hoạt động':'Đã ngừng'}</span></td><td><span className={`status-chip ${ballotStatus[person.id]?.[1]||person.round1Voted?'done':'pending'}`}>{ballotStatus[person.id]?.[1]||person.round1Voted?'Đã bỏ phiếu':'Chưa bỏ phiếu'}</span></td><td><span className={`status-chip ${ballotStatus[person.id]?.[2]||person.round2Voted?'done':'pending'}`}>{ballotStatus[person.id]?.[2]||person.round2Voted?'Đã bỏ phiếu':'Chưa bỏ phiếu'}</span></td><td><button className="outline-button" disabled={!person.rosterRecord||issuingCodes||deactivatingMemberId===person.id||!person.active} onClick={()=>issueLoginCode(person)}>{!person.rosterRecord?'Không có mã':!person.active?'Đã khóa':person.pendingAccount?'Cấp mã':'Cấp lại mã'}</button></td><td>{person.rosterRecord?<button className={person.active?'deactivate-button':'outline-button'} disabled={deactivatingMemberId===person.id} onClick={()=>setMemberActive(person)}>{deactivatingMemberId===person.id?'Đang lưu…':person.active?'Ngừng kích hoạt':'Kích hoạt lại'}</button>:<span>—</span>}</td></tr>)}</tbody></table>{!memberRows.length&&<div className="empty-state">Chưa có hồ sơ HDT trong danh sách.</div>}</div></section>}
        <footer className="footer"><span>© {new Date().getFullYear()} Đoàn Gioan Baotixita · Giáo xứ Bảo Sơn</span><div><span>Được xây dựng với <b>♥</b> và tinh thần phục vụ</span><i/> <button onClick={()=>notify(`Kết nối Firebase: ${firebaseConfigured?'đã cấu hình':'chưa cấu hình'}`)}>Phiên bản 1.0.0</button></div></footer>
      </div>
    </main>
    {showAddMembers&&<div className="modal-backdrop"><section className="panel code-modal add-members-modal"><button className="modal-close" onClick={()=>setShowAddMembers(false)} aria-label="Đóng"><X size={18}/></button><div className="admin-icon"><Users size={18}/></div><h2>Thêm Huynh trưởng</h2><div className="member-input-tabs"><button className={memberInputMode==='manual'?'selected':''} onClick={()=>setMemberInputMode('manual')}>Nhập biểu mẫu</button><button className={memberInputMode==='excel'?'selected':''} onClick={()=>setMemberInputMode('excel')}>Import Excel</button></div>{memberInputMode==='manual'?<form className="member-entry-form" onSubmit={addManualMember}><label><span className="member-label-heading">Họ và tên <b>*</b></span><input autoFocus value={memberEntry.name} onChange={event=>setMemberEntry({...memberEntry,name:event.target.value})} placeholder="Ví dụ: Nguyễn Văn An"/></label><label><span className="member-label-heading">Ngành <b>*</b></span><select required value={memberEntry.sector} onChange={event=>setMemberEntry({...memberEntry,sector:event.target.value})}><option value="">Chọn ngành</option>{sectors.map(sector=><option key={sector} value={sector}>{sector}</option>)}</select></label><label>Ngày sinh <span>(không bắt buộc)</span><input type="date" value={memberEntry.birthDate} max={new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date())} onChange={event=>setMemberEntry({...memberEntry,birthDate:event.target.value})}/></label><label>Email (không bắt buộc)<input type="email" value={memberEntry.email} onChange={event=>setMemberEntry({...memberEntry,email:event.target.value})} placeholder="ten@example.com"/></label><button className="outline-button" type="submit" disabled={pendingMembers.length>=300}>+ Thêm vào danh sách</button></form>:<div className="member-excel-import"><p>Chọn file Excel <b>.xlsx</b> hoặc CSV. Cột A là họ tên, B là ngành, C là ngày sinh, D là email (không bắt buộc). Ngày sinh có thể để trống. Có thể có dòng tiêu đề.</p><input ref={memberFileRef} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={importMemberFile} disabled={importingMembers||pendingMembers.length>=300}/><button type="button" className="template-download" onClick={downloadMemberTemplate}>Tải mẫu CSV (mở bằng Excel)</button>{importingMembers&&<small>Đang đọc file…</small>}</div>}{pendingMembers.length>0&&<div className="pending-members"><b>Danh sách chờ thêm ({pendingMembers.length})</b><ul>{pendingMembers.map((person,index)=><li key={`${person.name}-${index}`}><span><b>{person.name}</b><small>{person.sector||'Chưa chọn ngành'}{person.birthDate?` · ${person.birthDate.split('-').reverse().join('/')}`:''}{person.email?` · ${person.email}`:''}</small></span><button type="button" onClick={()=>setPendingMembers(items=>items.filter((_,itemIndex)=>itemIndex!==index))} aria-label={`Xóa ${person.name}`}><X size={15}/></button></li>)}</ul></div>}<small className="member-modal-note">Hồ sơ được kích hoạt ngay. Sau khi lưu danh sách, admin cấp mã riêng cho từng Huynh trưởng. Mã chỉ dùng một lần và hết hạn sau 4 giờ.</small><div className="add-members-actions"><button className="outline-button" onClick={()=>setShowAddMembers(false)} disabled={savingMembers}>Hủy</button><button className="primary-button" onClick={addMembers} disabled={savingMembers||importingMembers||!pendingMembers.length}>{savingMembers?'Đang lưu…':`Lưu ${pendingMembers.length||''} hồ sơ`}</button></div></section></div>}
    {showCandidatePicker&&<div className="modal-backdrop"><section className="panel candidate-picker-modal"><button className="modal-close" onClick={()=>setShowCandidatePicker(false)} aria-label="Đóng"><X size={18}/></button><div className="admin-icon"><Users size={18}/></div><h2>Chọn HDT đủ điều kiện ứng cử</h2><p>Chọn riêng những người được tham gia vòng 1. Danh sách HDT chung không bị thay đổi; những người không chọn sẽ không xuất hiện trong lá phiếu của kỳ này.</p><label className="search-box candidate-picker-search"><Search size={16}/><input value={candidatePickerSearch} onChange={event=>setCandidatePickerSearch(event.target.value)} placeholder="Tìm theo tên hoặc ngành…"/></label><div className="candidate-picker-count">Đã chọn <b>{candidatePickerSelected.length}</b> / {rosterMembers.length} HDT · cần ít nhất {round1Seats} ứng viên để mở vòng 1</div><div className="candidate-picker-list">{filteredCandidateRoster.map(person=><label className="candidate-picker-item" key={person.id}><input type="checkbox" checked={candidatePickerSelected.includes(person.id)} disabled={syncingCandidates} onChange={event=>setCandidatePickerSelected(ids=>event.target.checked?[...ids,person.id]:ids.filter(id=>id!==person.id))}/><span><b>{person.name}</b><small>{person.sector||'Chưa chọn ngành'}</small></span>{candidates.some(candidate=>candidate.id===person.id&&candidate.active!==false)&&<em>Đang là ứng viên</em>}</label>)}{!rosterMembers.length&&<div className="empty-state">Chưa có HDT trong danh sách. Hãy thêm hồ sơ trước.</div>}</div><div className="add-members-actions"><button className="outline-button" onClick={()=>setShowCandidatePicker(false)} disabled={syncingCandidates}>Hủy</button><button className="primary-button" onClick={saveCandidateSelection} disabled={syncingCandidates}>{syncingCandidates?'Đang lưu…':`Lưu ${candidatePickerSelected.length} ứng viên`}</button></div></section></div>}
    {issuedCodes.length>0&&<div className="modal-backdrop"><section className="panel code-modal issued-codes-modal"><button className="modal-close" onClick={()=>setIssuedCodes([])} aria-label="Đóng"><X size={18}/></button><div className="admin-icon"><ShieldCheck size={18}/></div><h2>{issuedCodes.length===1?`Mã đăng nhập của ${issuedCodes[0].person.name}`:`Đã cấp ${issuedCodes.length} mã đăng nhập`}</h2><p>Các mã chỉ hiện lần này, mỗi mã dùng một lần và hết hạn lúc {new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'short'}).format(issuedCodes[0].expiresAt.toDate())}.</p><div className="issued-codes-list"><p>Không gửi toàn bộ danh sách vào nhóm chung. Hãy gửi riêng mã của từng người.</p><ul>{issuedCodes.map(item=><li key={item.person.id}><span><b>{item.person.name}</b><small>{item.person.sector}</small></span><code>{item.code}</code><button onClick={()=>copyOneIssuedCode(item)}><Copy size={14}/> Sao chép</button></li>)}</ul></div><div className="issued-codes-actions"><button className="outline-button" onClick={copyIssuedCodes}><Copy size={15}/> Sao chép danh sách</button><button className="primary-button" onClick={downloadIssuedCodes}><Download size={15}/> Tải CSV</button><button className="outline-button" onClick={()=>setIssuedCodes([])}>Đóng</button></div></section></div>}
    {notice&&<div className="toast"><span><Check size={15}/></span>{notice}<button onClick={()=>setNotice('')}><X size={15}/></button></div>}
  </div>
}

function ElectionAdminPanel({form,setForm,election,electionRecords,electionId,onSwitchElection,onCreateElection,creatingElection,historyLocked,rosterMembers,candidates,runoffs,round1Tallies,round2Tallies,round2Winners,setRound2Winners,onFinalizeRound2,finalizingRound2,finalizingRound1,onFinalizeRound1,saving,syncing,publishingResults,onSave,onOpenCandidatePicker,onToggleCandidate,onToggleElected,onOpenRound1,onOpenRound2,onCloseRound,onPublishResults,round1Seats,round2Seats}) {
  const activeCandidates = candidates.filter(person => person.active !== false)
  const rosterById = new Map(rosterMembers.map(person=>[person.id,person]))
  const sortedCandidates = candidates.filter(person=>person.active!==false&&rosterById.has(person.id)).map(person=>{
    const rosterPerson=rosterById.get(person.id)
    return {...person,name:person.name||rosterPerson?.name||'',sector:person.sector||rosterPerson?.sector||''}
  }).sort((a,b) => (round1Tallies[b.id]||0) - (round1Tallies[a.id]||0) || String(a.name||'').localeCompare(String(b.name||''),'vi'))
  const electedCandidates = activeCandidates.filter(person => person.elected)
  const isOpen = election?.status === 'open'
  return <div className="election-admin-grid">
    <section className="panel election-config-panel">
      <div className="results-header"><div><span className="banner-kicker">THIẾT LẬP NHIỆM KỲ</span><h2>Thông tin kỳ bầu cử</h2><p>Nhập thông tin sẽ hiển thị cho toàn Xứ đoàn.</p></div><span className={`status-chip ${isOpen?'elected':'pending'}`}>{isOpen?`ĐANG MỞ · VÒNG ${election.activeRound}`:'ĐANG ĐÓNG'}</span></div>
      <div className="election-picker-row"><label>Chọn kỳ đang quản lý<select value={electionId} disabled={isOpen||creatingElection} onChange={event=>onSwitchElection(event.target.value)}>{electionRecords.map(item=><option key={item.id} value={item.id}>{item.term?`${item.term} · `:''}${item.name||'Kỳ chưa đặt tên'}{item.id==='current'?' · dữ liệu cũ':''}</option>)}</select></label><button className="outline-button" onClick={onCreateElection} disabled={isOpen||creatingElection}>{creatingElection?'Đang tạo kỳ…':'＋ Tạo kỳ bầu cử mới'}</button></div>
      <div className="election-form-grid">
        <label>Tên kỳ bầu cử<input value={form.name} disabled={isOpen||historyLocked} onChange={event=>setForm({...form,name:event.target.value})} placeholder="Bầu chọn Ban điều hành Xứ đoàn"/></label>
        <label>Nhiệm kỳ<input value={form.term} disabled={isOpen||historyLocked} onChange={event=>setForm({...form,term:event.target.value})} placeholder="Ví dụ: 2026 – 2029"/></label>
        <label className="election-description-field">Mô tả<textarea rows="2" value={form.description} disabled={isOpen||historyLocked} onChange={event=>setForm({...form,description:event.target.value})} placeholder="Thông tin ngắn về kỳ bầu cử"/></label>
        <label>Số người được bầu vòng 1<input type="number" min="1" max="200" value={form.round1Seats} disabled={isOpen||historyLocked} onChange={event=>setForm({...form,round1Seats:event.target.value,round2Seats:Number(form.round2Seats)>Number(event.target.value)?event.target.value:form.round2Seats})}/><small>Số người mỗi cử tri được chọn và số người cần chốt trúng cử.</small></label>
        <label>Số người được bầu vòng 2<input type="number" min="1" max={form.round1Seats||1} value={form.round2Seats} disabled={isOpen||historyLocked} onChange={event=>setForm({...form,round2Seats:event.target.value})}/><small>Không vượt quá số người đã trúng cử vòng 1.</small></label>
        <label>Hạn kết thúc vòng đang mở<input type="datetime-local" value={form.endsAt} disabled={isOpen||historyLocked} onChange={event=>setForm({...form,endsAt:event.target.value})}/><small>Giờ Việt Nam (UTC+7). Có thể cập nhật trước khi có phiếu.</small></label>
      </div>
      <div className="election-config-actions"><span>{rosterMembers.length} HDT đang hoạt động · {activeCandidates.length} ứng viên{historyLocked?' · kỳ đã có dữ liệu, cấu hình được khóa':''}</span><button className="primary-button" onClick={onSave} disabled={saving||isOpen||historyLocked}>{saving?'Đang lưu…':'Lưu cấu hình'}</button></div>
    </section>
    <section className="panel election-round-panel">
      <div className="results-header"><div><span className="banner-kicker">ĐIỀU KHIỂN BẦU CỬ</span><h2>Các vòng bầu chọn</h2><p>Chỉ mở vòng sau khi đã kiểm tra danh sách và hạn kết thúc.</p></div><CalendarDays size={22}/></div>
      <div className="round-admin-row"><div><b>Vòng 1 · Bầu {round1Seats} thành viên</b><small>{election?.round1VotedCount||0} / {rosterMembers.length} HDT đã bỏ phiếu{election?.round1Finalized?' · ĐÃ CHỐT':''}</small></div><div className="round-admin-actions">{isOpen&&election.activeRound===1?<button className="outline-button" onClick={onCloseRound} disabled={saving}>Đóng vòng 1</button>:election?.activeRound===1?<><button className="outline-button" onClick={()=>onPublishResults(1)} disabled={saving||publishingResults||isOpen}>{publishingResults?'Đang tổng hợp…':'Tổng hợp phiếu'}</button><button className="primary-button" onClick={onOpenRound1} disabled={saving||isOpen}>Mở vòng 1</button></>:<span className="status-chip elected">Vòng 1 đã hoàn tất</span>}</div></div>
      {election?.activeRound===1&&election?.status!=='open'&&<div className="round1-finalization"><div><b>{election?.round1Finalized?'Kết quả vòng 1 đã chốt':`Đã chọn ${electedCandidates.length} / ${round1Seats} người trúng cử`}</b><small>{runoffs.filter(item=>(item.sourceRound||1)===1).length?`Vòng phụ: ${runoffs.filter(item=>(item.sourceRound||1)===1&&item.finalized).length} / ${runoffs.filter(item=>(item.sourceRound||1)===1).length} đợt đã chốt.`:'Rà soát kết quả và xử lý hòa phiếu trước khi chốt.'}</small></div><button className="primary-button" onClick={onFinalizeRound1} disabled={finalizingRound1||election?.round1Finalized||electedCandidates.length!==round1Seats||runoffs.some(item=>(item.sourceRound||1)===1&&!item.finalized)}>{finalizingRound1?'Đang chốt…':election?.round1Finalized?'Đã chốt vòng 1':'Chốt kết quả vòng 1'} <Check size={15}/></button></div>}
      <div className="round-admin-row"><div><b>Vòng 2 · Bầu {round2Seats} Ban Thường vụ</b><small>{electedCandidates.length} / {round1Seats} người đã được chốt từ vòng 1 · {election?.round2VotedCount||0} HDT đã bỏ phiếu{election?.round2Finalized?' · ĐÃ CHỐT':''}</small></div><div className="round-admin-actions">{isOpen&&election.activeRound===2?<button className="outline-button" onClick={onCloseRound} disabled={saving}>Đóng vòng 2</button>:<><button className="outline-button" onClick={()=>onPublishResults(2)} disabled={saving||publishingResults||isOpen||election?.activeRound!==2}>{publishingResults?'Đang tổng hợp…':'Tổng hợp phiếu'}</button><button className="primary-button" onClick={onOpenRound2} disabled={saving||isOpen||election?.activeRound!==1||!election?.round1Finalized||electedCandidates.length!==round1Seats}>Mở vòng 2</button></>}</div></div>
      {election?.activeRound===2&&election?.status!=='open'&&<Round2FinalizationPanel candidates={candidates} candidateIds={election?.round2CandidateIds||electedCandidates.map(person=>person.id)} tallies={round2Tallies} selectedIds={round2Winners} setSelectedIds={setRound2Winners} finalized={election?.round2Finalized===true} saving={finalizingRound2} onFinalize={onFinalizeRound2} seats={round2Seats}/>}
      <div className="election-backend-warning"><ShieldCheck size={17}/><span><b>Gửi phiếu không cần Cloud Functions</b>Phiếu được Firestore Rules bảo vệ và chỉ admin đọc được. Khi admin đang đăng nhập, bảng tổng phiếu sẽ cập nhật trực tiếp; sau khi đóng vòng, nhấn “Tổng hợp phiếu” để chốt lại kết quả.</span></div>
    </section>
    {election?.activeRound!==2&&<section className="panel election-candidates-panel">
      <div className="results-header"><div><span className="banner-kicker">DANH SÁCH ỨNG VIÊN</span><h2>HDT được chọn vào vòng 1</h2><p>Chỉ những HDT đủ điều kiện do admin chọn mới được tham gia ứng cử.</p></div><button className="outline-button" onClick={onOpenCandidatePicker} disabled={syncing||isOpen||historyLocked}>{syncing?'Đang lưu…':'Chọn HDT từ danh sách'}</button></div>
      <div className="elected-summary"><b>Đã chốt trúng cử vòng 1: {electedCandidates.length} / {round1Seats}</b><span>Đánh dấu đúng {round1Seats} người sau khi kiểm tra kết quả; xử lý hòa phiếu trước khi chốt.</span></div>
      <div className="table-wrap"><table><thead><tr><th>HUYNH TRƯỞNG</th><th>NGÀNH</th><th>PHIẾU VÒNG 1</th><th>ỨNG VIÊN VÒNG 1</th><th>TRÚNG CỬ</th></tr></thead><tbody>{sortedCandidates.map(person=><tr key={person.id}><td><b>{person.name||'HDT (thiếu họ tên trong danh sách)'}</b></td><td>{person.sector||'—'}</td><td><b>{round1Tallies[person.id]||0}</b></td><td><button className="outline-button" disabled={isOpen||historyLocked} onClick={()=>onToggleCandidate(person)}>Loại khỏi vòng 1</button></td><td><input type="checkbox" aria-label={`Đánh dấu ${person.name||'HDT'} trúng cử vòng 1`} checked={person.elected===true} disabled={isOpen||election?.activeRound!==1||election?.round1Finalized} onChange={()=>onToggleElected(person)}/></td></tr>)}</tbody></table>{!sortedCandidates.length&&<div className="empty-state">Chưa có HDT được chọn vào vòng 1. Nhấn “Chọn HDT từ danh sách” để thêm người đủ điều kiện.</div>}</div>
    </section>}
    {election?.activeRound===2&&<section className="panel election-candidates-panel"><div className="results-header"><div><span className="banner-kicker">DANH SÁCH VÒNG 2</span><h2>Ứng viên Ban Thường vụ</h2><p>Danh sách lấy từ những người đã chốt trúng cử vòng 1.</p></div></div><div className="elected-summary"><b>{(election?.round2CandidateIds||electedCandidates.map(person=>person.id)).length} ứng viên · bầu {round2Seats} người</b><span>{election?.round2VotedCount||0} / {rosterMembers.length} HDT đã bỏ phiếu vòng 2.</span></div><div className="table-wrap"><table><thead><tr><th>HUYNH TRƯỞNG</th><th>NGÀNH</th><th>PHIẾU VÒNG 2</th><th>KẾT QUẢ</th></tr></thead><tbody>{sortedCandidates.filter(person=>(election?.round2CandidateIds||electedCandidates.map(candidate=>candidate.id)).includes(person.id)).map(person=><tr key={person.id}><td><b>{person.name}</b></td><td>{person.sector||'—'}</td><td><b>{round2Tallies[person.id]||0}</b></td><td><span className={`status-chip ${(election?.round2WinnerIds||[]).includes(person.id)?'elected':'pending'}`}>{election?.round2Finalized?(election?.round2WinnerIds||[]).includes(person.id)?'Trúng cử':'Chưa trúng cử':'Chưa chốt'}</span></td></tr>)}</tbody></table></div></section>}
  </div>
}

function Round2FinalizationPanel({candidates,candidateIds,tallies,selectedIds,setSelectedIds,finalized,saving,onFinalize,seats}) {
  const rows = candidateIds.map(id=>candidates.find(person=>person.id===id)).filter(Boolean).map(person=>({...person,votes:tallies[person.id]||0})).sort((a,b)=>b.votes-a.votes||String(a.name||'').localeCompare(String(b.name||''),'vi'))
  return <div className="round2-finalization">
    <div className="results-header"><div><span className="banner-kicker">CHỐT KẾT QUẢ VÒNG 2</span><h3>Chọn {seats} người vào Ban Thường vụ</h3><p>{finalized?'Kết quả đã được chốt. Có thể chỉnh lại sau khi xác nhận.':`Vòng 2 đã đóng. Rà soát số phiếu rồi đánh dấu đúng ${seats} người.`}</p></div><span className={`status-chip ${finalized?'elected':'pending'}`}>{finalized?'ĐÃ CHỐT':'CHỜ CHỐT'}</span></div>
    <div className="elected-summary"><b>Đã chọn {selectedIds.length} / {seats}</b><span>Thứ tự gợi ý theo số phiếu vòng 2 từ cao xuống thấp.</span></div>
    <div className="table-wrap"><table><thead><tr><th>CHỌN</th><th>HẠNG</th><th>HUYNH TRƯỞNG</th><th>NGÀNH</th><th>PHIẾU VÒNG 2</th></tr></thead><tbody>{rows.map((person,index)=><tr key={person.id}><td><input type="checkbox" aria-label={`Chọn ${person.name} vào Ban Thường vụ`} checked={selectedIds.includes(person.id)} disabled={saving} onChange={event=>setSelectedIds(ids=>event.target.checked?[...ids,person.id]:ids.filter(id=>id!==person.id))}/></td><td>{String(index+1).padStart(2,'0')}</td><td><b>{person.name}</b></td><td>{person.sector||'—'}</td><td><b>{person.votes}</b></td></tr>)}</tbody></table></div>
    <div className="round2-finalize-actions"><span>Chỉ danh sách {seats} người được lưu; phiếu và số phiếu vòng 2 không đổi.</span><button className="primary-button" onClick={onFinalize} disabled={saving||selectedIds.length!==seats}>{saving?'Đang chốt…':finalized?'Cập nhật kết quả':'Chốt kết quả vòng 2'} <Check size={15}/></button></div>
  </div>
}

function RunoffAdminPanel({candidates,tallies,runoffTallies,activeRunoff,displayedRunoff,selectedIds,setSelectedIds,seats,setSeats,endsAt,setEndsAt,winners,setWinners,rosterCount,round1Seats,round2Seats,electionRound,round2CandidateIds,round2Tallies,isElectionOpen,resultFinalized,saving,onCreate,onClose,onFinalize}) {
  const sourceRound = displayedRunoff?.sourceRound || activeRunoff?.sourceRound || electionRound
  const targetSeats = sourceRound === 2 ? round2Seats : round1Seats
  const sourceTallies = sourceRound === 2 ? round2Tallies : tallies
  const eligibleIds = sourceRound === 2 ? round2CandidateIds : candidates.filter(person=>person.active!==false).map(person=>person.id)
  const eligibleCandidates = candidates.filter(person=>person.active!==false&&eligibleIds.includes(person.id))
  const selectedCandidates = eligibleCandidates.filter(person => selectedIds.includes(person.id))
  const sourceOrder = eligibleCandidates.map(person=>({...person,votes:sourceTallies[person.id]||0})).sort((a,b)=>b.votes-a.votes||String(a.name||'').localeCompare(String(b.name||''),'vi'))
  const cutoffVotes = sourceOrder[targetSeats-1]?.votes
  const suggestedTie = cutoffVotes === undefined ? [] : sourceOrder.filter(person=>person.votes===cutoffVotes)
  const seatsAtCutoff = cutoffVotes === undefined ? 0 : targetSeats-sourceOrder.filter(person=>person.votes>cutoffVotes).length
  const runoffCandidates = (displayedRunoff?.candidateIds || activeRunoff?.candidateIds || []).map(id => candidates.find(person => person.id === id)).filter(Boolean).sort((a,b) => (runoffTallies[b.id] || 0) - (runoffTallies[a.id] || 0) || String(a.name||'').localeCompare(String(b.name||''), 'vi'))
  const tieAlreadyFinalized = Boolean(displayedRunoff?.finalized)
  const tiedIds = displayedRunoff?.candidateIds || []
  const remainingWinnerSlots = Math.max(0,(displayedRunoff?.seats||0)-winners.length)
  const outsideTieCandidates = eligibleIds.filter(id=>!tiedIds.includes(id)).map(id=>({id,votes:sourceTallies[id]||0,name:candidates.find(person=>person.id===id)?.name||''})).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name,'vi'))
  const alreadyElectedOutsideTie = sourceRound===1 ? candidates.filter(person=>person.elected&&!tiedIds.includes(person.id)).length : Math.max(0,targetSeats-(displayedRunoff?.seats||0))
  const projectedWinners = sourceRound===1 ? alreadyElectedOutsideTie+winners.length : alreadyElectedOutsideTie+winners.length
  return <section className="panel election-candidates-panel runoff-admin-panel">
    <div className="results-header"><div><span className="banner-kicker">XỬ LÝ HÒA PHIẾU · VÒNG {sourceRound}</span><h2>{sourceRound===2?'Vòng phụ vòng 2':'Vòng phụ vòng 1'}</h2><p>Vòng phụ có phiếu và bảng điểm riêng; không sửa phiếu hoặc số phiếu gốc vòng {sourceRound}.</p></div>{activeRunoff&&<span className="status-chip elected"><i/> ĐANG MỞ</span>}</div>
    {!activeRunoff&&isElectionOpen&&<div className="runoff-create-note"><ShieldCheck size={17}/><span>Vòng {sourceRound} đang mở. Đóng vòng này trước khi tạo vòng phụ.</span></div>}
    {!activeRunoff&&!isElectionOpen&&resultFinalized&&<div className="runoff-create-note"><ShieldCheck size={17}/><span>Kết quả vòng {sourceRound} đã chốt; không thể tạo thêm vòng phụ.</span></div>}
    {!activeRunoff&&!isElectionOpen&&!resultFinalized&&<>
      <div className="runoff-create-note"><ShieldCheck size={17}/><span>Chọn toàn bộ người đồng phiếu tại ranh giới {targetSeats} người. Vòng phụ không thay đổi phiếu gốc vòng {sourceRound}.</span></div>
      {suggestedTie.length>1&&<div className="runoff-suggestion"><span>Gợi ý theo kết quả hiện tại: vị trí {round1Seats} đang hòa ở <b>{cutoffVotes} phiếu</b> ({suggestedTie.length} người, còn {seatsAtCutoff} suất).</span><button className="outline-button" onClick={()=>{setSelectedIds(suggestedTie.map(person=>person.id));setSeats(String(seatsAtCutoff))}}>Chọn nhóm hòa này</button></div>}
      <div className="table-wrap runoff-candidate-picker"><table><thead><tr><th>CHỌN</th><th>HUYNH TRƯỞNG</th><th>NGÀNH</th><th>PHIẾU VÒNG {sourceRound}</th></tr></thead><tbody>{sourceOrder.map(person=><tr key={person.id}><td><input type="checkbox" aria-label={`Chọn ${person.name||'HDT'} vào vòng phụ`} checked={selectedIds.includes(person.id)} onChange={event=>setSelectedIds(ids=>event.target.checked?[...ids,person.id]:ids.filter(id=>id!==person.id))}/></td><td><b>{person.name||'HDT (không còn trong danh sách HDT)'}</b></td><td>{person.sector||'—'}</td><td><b>{person.votes}</b> phiếu</td></tr>)}</tbody></table>{!eligibleCandidates.length&&<div className="empty-state">Chưa có ứng viên đủ điều kiện cho vòng {sourceRound}.</div>}</div>
      <div className="runoff-create-form"><label>Số suất cần phân định<input type="number" min="1" max={Math.max(1,selectedCandidates.length-1)} value={seats} onChange={event=>setSeats(event.target.value)}/><small>{selectedCandidates.length} ứng viên được chọn · cần chọn từ 1 đến {Math.max(0,selectedCandidates.length-1)} người</small></label><label>Hạn kết thúc vòng phụ<input type="datetime-local" value={endsAt} onChange={event=>setEndsAt(event.target.value)}/><small>Chọn thời điểm tương lai theo giờ Việt Nam.</small></label><button className="primary-button" onClick={onCreate} disabled={saving||selectedCandidates.length<2}>{saving?'Đang tạo…':`Tạo vòng phụ ${sourceRound}`} <ArrowUpRight size={15}/></button></div>
    </>}
    {activeRunoff&&<>
      <div className="elected-summary"><b>{activeRunoff.candidateIds?.length||0} người · cần chọn {activeRunoff.seats} · đã bỏ phiếu {activeRunoff.votedCount||0}/{activeRunoff.voterCount||rosterCount}</b><span>Hạn: {activeRunoff.endsAt?.toDate?activeRunoff.endsAt.toDate().toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'}):'—'}. Cử tri vẫn là HDT trong đoàn.</span></div>
      <div className="table-wrap"><table><thead><tr><th>HẠNG</th><th>HUYNH TRƯỞNG</th><th>NGÀNH</th><th>PHIẾU VÒNG {sourceRound}</th><th>PHIẾU PHỤ HIỆN CÓ</th></tr></thead><tbody>{runoffCandidates.map((person,index)=><tr key={person.id}><td>{String(index+1).padStart(2,'0')}</td><td><b>{person.name}</b></td><td>{person.sector||'—'}</td><td>{sourceTallies[person.id]||0}</td><td><b>{runoffTallies[person.id]||0}</b></td></tr>)}</tbody></table></div>
      <div className="round-admin-actions runoff-action-row"><button className="outline-button" onClick={onClose} disabled={saving}>{saving?'Đang lưu…':'Đóng vòng phụ'}</button></div>
    </>}
    {!activeRunoff&&displayedRunoff&&<div className="runoff-history">
      <div className="results-header"><div><span className="banner-kicker">{tieAlreadyFinalized?'ĐÃ CHỐT':'ĐỢT PHỤ ĐÃ ĐÓNG'} · VÒNG {sourceRound}</span><h3>Kết quả vòng phụ vòng {sourceRound}</h3><p>{displayedRunoff.votedCount||0} HDT đã bỏ phiếu · chọn đúng {displayedRunoff.seats} người để hoàn tất danh sách {targetSeats}.</p></div><span className={`status-chip ${tieAlreadyFinalized?'elected':'pending'}`}>{tieAlreadyFinalized?'ĐÃ CHỐT':'CHỜ CHỐT'}</span></div>
      {!tieAlreadyFinalized&&<div className="elected-summary"><b>Đã chọn {winners.length} / {displayedRunoff.seats} người thắng vòng phụ</b><span>{alreadyElectedOutsideTie} người ngoài nhóm hòa sẽ vào danh sách · sau khi chốt sẽ có {projectedWinners} / {targetSeats} người.</span></div>}
      <div className="table-wrap"><table><thead><tr><th>HẠNG</th><th>CHỌN THẮNG</th><th>HUYNH TRƯỞNG</th><th>NGÀNH</th><th>PHIẾU VÒNG {sourceRound}</th><th>PHIẾU PHỤ</th></tr></thead><tbody>{runoffCandidates.map((person,index)=><tr key={person.id}><td>{String(index+1).padStart(2,'0')}</td><td><input type="checkbox" aria-label={`Chọn ${person.name} thắng vòng phụ`} checked={winners.includes(person.id)} disabled={tieAlreadyFinalized||saving} onChange={event=>setWinners(ids=>event.target.checked?[...ids,person.id]:ids.filter(id=>id!==person.id))}/></td><td><b>{person.name}</b></td><td>{person.sector||'—'}</td><td>{sourceTallies[person.id]||0}</td><td><b>{runoffTallies[person.id]||0}</b></td></tr>)}</tbody></table></div>
      {!tieAlreadyFinalized&&<div className="round-admin-actions runoff-action-row"><button className="primary-button" onClick={onFinalize} disabled={saving||winners.length!==displayedRunoff.seats||projectedWinners!==targetSeats}>{saving?'Đang chốt…':`Chốt kết quả vòng phụ ${sourceRound}`} <Check size={15}/></button></div>}
      <div className="runoff-create-note"><ShieldCheck size={17}/><span>Sau khi chốt, kết quả phiếu gốc vòng {sourceRound} và bảng tổng phiếu vẫn được giữ nguyên.</span></div>
    </div>}
  </section>
}

function RunoffPublicResults({runoff,candidates,originalTallies,runoffTallies}) {
  const sourceRound = runoff.sourceRound || 1
  const rows = (runoff.candidateIds||[]).map(id=>candidates.find(person=>person.id===id)).filter(Boolean).sort((a,b)=>(runoffTallies[b.id]||0)-(runoffTallies[a.id]||0)||String(a.name||'').localeCompare(String(b.name||''),'vi'))
  return <section className="panel results-panel runoff-public-results"><div className="results-header"><div><span className="banner-kicker">KẾT QUẢ RIÊNG · VÒNG PHỤ {sourceRound}</span><h2>Phân định nhóm hòa phiếu vòng {sourceRound}</h2><p>{runoff.votedCount||0} HDT đã bỏ phiếu · chọn {runoff.seats} người. Bảng điểm này độc lập với tổng phiếu vòng {sourceRound}.</p></div><span className={`status-chip ${runoff.finalized?'elected':'pending'}`}>{runoff.finalized?'ĐÃ CHỐT':'CHỜ ADMIN CHỐT'}</span></div><div className="table-wrap"><table><thead><tr><th>HẠNG</th><th>HUYNH TRƯỞNG</th><th>NGÀNH</th><th>PHIẾU VÒNG {sourceRound}</th><th>PHIẾU PHỤ</th><th>KẾT QUẢ PHỤ</th></tr></thead><tbody>{rows.map((person,index)=><tr key={person.id}><td>{String(index+1).padStart(2,'0')}</td><td><div className="person-cell"><Avatar person={person} size="small"/><b>{person.name}</b></div></td><td>{person.sector||'—'}</td><td>{originalTallies[person.id]||0}</td><td><b>{runoffTallies[person.id]||0}</b></td><td><span className={`status-chip ${runoff.winnerIds?.includes(person.id)?'elected':'pending'}`}>{runoff.winnerIds?.includes(person.id)?'Trúng cử':runoff.finalized?'Chưa trúng cử':'Chưa chốt'}</span></td></tr>)}</tbody></table></div></section>
}

function StatCard({icon,tint,label,value,suffix,change,note,progress,badge}){return <div className="stat-card"><div className="stat-top"><div className={`stat-icon ${tint}`}>{icon}</div>{change&&<span className="stat-change">{change}</span>}{badge&&<span className="status-chip elected"><i/> ĐANG DIỄN RA</span>}</div><span className="stat-label">{label}</span><div className="stat-value">{value}{suffix&&<small>{suffix}</small>}</div>{progress!==undefined?<><ProgressBar value={progress} color="green"/><span className="stat-note">{note}</span></>:<span className="stat-note">{note}</span>}</div>}
function ProgressBar({value,color}){return <div className={`progress-bar ${color}`}><i style={{width:`${value}%`}}/></div>}
function PanelTitle({title,subtitle,action,onAction}){return <div className="panel-title"><div><h3>{title}</h3><p>{subtitle}</p></div><button onClick={onAction}>{action}<ChevronRight size={14}/></button></div>}
function Activity({color,icon,title,detail,time}){return <div className="activity-row"><div className={`activity-icon ${color}`}>{icon}</div><div><b>{title}</b><p>{detail}</p><small>{time}</small></div></div>}

export default App
