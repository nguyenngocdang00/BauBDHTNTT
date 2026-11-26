import { useMemo, useState } from 'react'
import { Bell, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Download, Eye, LayoutDashboard, LogOut, Search, Settings, ShieldCheck, SlidersHorizontal, Users, Vote, X, Check, Clock3, ArrowUpRight, Menu } from 'lucide-react'
import { firebaseConfigured } from './firebase.js'

const initialCandidates = [
  { id: 'an', name: 'Maria Nguyễn Hoàng An', short: 'An', initials: 'NA', color: 'peach', sector: 'Ngành Nghĩa', votes: 78, elected: true },
  { id: 'minh', name: 'Têrêsa Trần Gia Minh', short: 'Minh', initials: 'TM', color: 'lavender', sector: 'Ngành Thiếu', votes: 72, elected: true },
  { id: 'chau', name: 'Giuse Phạm Minh Châu', short: 'Châu', initials: 'PC', color: 'blue', sector: 'Ngành Ấu', votes: 69, elected: true },
  { id: 'vy', name: 'Maria Lê Khánh Vy', short: 'Vy', initials: 'LV', color: 'mint', sector: 'Ngành Chiên', votes: 64, elected: true },
  { id: 'khang', name: 'Phêrô Võ Nhật Khang', short: 'Khang', initials: 'VK', color: 'sand', sector: 'Ngành Thiếu', votes: 61, elected: true },
  { id: 'thao', name: 'Anna Nguyễn Phương Thảo', short: 'Thảo', initials: 'NT', color: 'pink', sector: 'Ngành Hiệp', votes: 58, elected: true },
  { id: 'bao', name: 'Đaminh Bùi Quốc Bảo', short: 'Bảo', initials: 'BB', color: 'blue', sector: 'Ngành Nghĩa', votes: 55, elected: true },
  { id: 'linh', name: 'Maria Đặng Ngọc Linh', short: 'Linh', initials: 'ĐL', color: 'mint', sector: 'Ngành Chiên', votes: 51, elected: true },
  { id: 'tuan', name: 'Gioan Trần Anh Tuấn', short: 'Tuấn', initials: 'TT', color: 'sand', sector: 'Ngành Thiếu', votes: 48, elected: true },
  { id: 'mai', name: 'Têrêsa Phạm Ngọc Mai', short: 'Mai', initials: 'PM', color: 'lavender', sector: 'Ngành Ấu', votes: 43, elected: true },
  { id: 'phuc', name: 'Micae Nguyễn Minh Phúc', short: 'Phúc', initials: 'NP', color: 'peach', sector: 'Ngành Hiệp', votes: 39, elected: true },
  { id: 'huy', name: 'Phaolô Lê Quang Huy', short: 'Huy', initials: 'LH', color: 'pink', sector: 'Ngành Thiếu', votes: 36 },
  { id: 'tram', name: 'Anna Võ Diệu Trâm', short: 'Trâm', initials: 'VT', color: 'mint', sector: 'Ngành Nghĩa', votes: 31 },
]

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

function Avatar({ person, size = 'normal' }) { return <div className={`avatar ${person.color} ${size}`}>{person.initials}</div> }
function App() {
  const [tab, setTab] = useState('dashboard')
  const [round, setRound] = useState(1)
  const [selected, setSelected] = useState(['an', 'minh', 'chau', 'vy', 'khang', 'thao', 'bao', 'linh', 'tuan', 'mai', 'phuc'])
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [admin, setAdmin] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [candidates, setCandidates] = useState(initialCandidates)
  const [showResults, setShowResults] = useState(false)
  const [roleAssignments, setRoleAssignments] = useState({})
  const ranked = useMemo(() => [...candidates].sort((a, b) => b.votes - a.votes), [candidates])
  const filtered = ranked.filter(person => `${person.name} ${person.sector}`.toLowerCase().includes(query.toLowerCase()))
  const ballotCandidates = round === 1 ? candidates : candidates.filter(person => person.elected)
  const maxSelection = round === 1 ? 11 : 5
  const pct = Math.round((187 / 248) * 100)
  const notify = (message) => { setNotice(message); window.setTimeout(() => setNotice(''), 3000) }
  const selectCandidate = (id) => {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : current.length < maxSelection ? [...current, id] : current)
    if (!selected.includes(id) && selected.length >= maxSelection) notify(`Bạn chỉ có thể chọn tối đa ${maxSelection} người.`)
  }
  const submitBallot = () => {
    if (selected.length !== maxSelection) return notify(`Vui lòng chọn đủ ${maxSelection} người trước khi xác nhận.`)
    setCandidates(current => current.map(person => selected.includes(person.id) ? { ...person, votes: person.votes + 1 } : person))
    notify(`Phiếu vòng ${round} đã được ghi nhận thành công.`)
    setTab('dashboard')
  }
  const nav = [
    { key: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { key: 'vote', label: 'Bầu chọn', icon: Vote, dot: true },
    { key: 'results', label: 'Kết quả', icon: ClipboardList },
    ...(admin ? [{ key: 'members', label: 'Danh sách HDT', icon: Users }, { key: 'roles', label: 'Phân chức vụ', icon: SlidersHorizontal }] : []),
  ]
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark"><span>✳</span></div><div><b>Xứ đoàn Anrê</b><small>THIẾU NHI THÁNH THỂ</small></div><button className="mobile-close" onClick={() => setMenuOpen(false)}><X size={17}/></button></div>
      <div className="workspace-label">KHÔNG GIAN LÀM VIỆC</div>
      <button className="workspace-switch"><div className="tiny-emblem">✳</div><span><b>Ban điều hành</b><small>Nhiệm kỳ 2025 – 2027</small></span><ChevronDown size={16}/></button>
      <div className="nav-label">MENU CHÍNH</div>
      <nav>{nav.map(item => <button key={item.key} className={`nav-item ${tab === item.key ? 'active' : ''}`} onClick={() => { setTab(item.key); setMenuOpen(false) }}><item.icon size={18}/><span>{item.label}</span>{item.dot && <i className="nav-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom">
        <button className="nav-item" onClick={() => notify('Hướng dẫn bầu chọn sẽ sớm được cập nhật.')}><CircleHelp size={18}/><span>Trợ giúp</span></button>
        <div className="admin-toggle"><div className="admin-icon"><ShieldCheck size={17}/></div><div><b>Chế độ quản trị</b><small>{admin ? 'Đang bật' : 'Chỉ admin đoàn'}</small></div><button className={`switch ${admin ? 'on' : ''}`} aria-label="Bật chế độ quản trị" onClick={() => { setAdmin(!admin); notify(admin ? 'Đã tắt chế độ quản trị.' : 'Đã bật giao diện quản trị mẫu.') }}><i/></button></div>
        <button className="profile"><Avatar person={{ initials: 'MV', color: 'olive' }}/><span><b>Maria Nguyễn Văn</b><small>Huynh trưởng · Ngành Nghĩa</small></span><ChevronDown size={15}/></button>
      </div>
    </aside>
    {menuOpen && <button className="scrim" aria-label="Đóng menu" onClick={() => setMenuOpen(false)}/>}
    <main className="main-area">
      <header className="topbar"><div className="crumb"><button className="hamburger" onClick={() => setMenuOpen(true)}><Menu size={20}/></button><span>Cổng thông tin</span><ChevronRight size={15}/><b>{nav.find(item => item.key === tab)?.label || 'Tổng quan'}</b></div><div className="top-actions"><span className="cycle-pill"><i/> ĐANG DIỄN RA</span><button className="icon-button" onClick={() => notify('Bạn không có thông báo mới.')}><Bell size={18}/><i/></button><div className="top-divider"/><button className="top-profile" onClick={() => setAdmin(!admin)}><Avatar person={{ initials: 'MV', color: 'olive' }} size="small"/><ChevronDown size={14}/></button></div></header>
      <div className="content">
        <div className="welcome-line"><div><div className="eyebrow"><span>✳</span> XỨ ĐOÀN ANRÊ · GIÁO XỨ THÁNH GIA</div><h1>{tab === 'dashboard' ? 'Chào buổi sáng, Maria' : tab === 'vote' ? 'Phiếu bầu của bạn' : tab === 'results' ? 'Kết quả bầu chọn' : tab === 'roles' ? 'Phân công chức vụ' : 'Danh sách Huynh trưởng'} <span className="wave">✦</span></h1><p>Chúc bạn một ngày tràn đầy niềm vui và bình an trong Chúa.</p></div><button className="help-button" onClick={() => notify('Liên hệ admin đoàn để được hỗ trợ.')}><CircleHelp size={16}/> Hướng dẫn bầu chọn</button></div>
        <div className="election-banner"><div className="banner-pattern"/><div className="banner-icon"><Vote size={21}/></div><div className="banner-copy"><span className="banner-kicker">KỲ BẦU CỬ · NHIỆM KỲ 2025 – 2027</span><b>Bầu chọn Ban điều hành Xứ đoàn</b><span>Hãy cùng chọn ra những người sẽ đồng hành và phục vụ Xứ đoàn trong nhiệm kỳ mới.</span></div><div className="banner-separator"/><div className="banner-deadline"><span>THỜI GIAN CÒN LẠI</span><b>02 <small>ngày</small> 14 <small>giờ</small></b><span>Kết thúc lúc 23:59, 24/11/2025</span></div><button className="banner-cta" onClick={() => { setTab('vote'); setSelected([]) }}>Bắt đầu bầu chọn <ArrowUpRight size={16}/></button></div>
        {tab === 'dashboard' && <>
          <div className="section-heading"><div><h2>Tổng quan bầu cử</h2><p>Theo dõi tiến độ và thông tin kỳ bầu cử hiện tại</p></div><button className="date-filter">◷ <span>Toàn bộ thời gian</span><ChevronDown size={14}/></button></div>
          <div className="stat-grid"><StatCard icon={<Users size={18}/>} tint="purple" label="Tổng số Huynh trưởng" value="248" change="↑ 12%" note="so với nhiệm kỳ trước"/><StatCard icon={<Vote size={18}/>} tint="green" label="Đã tham gia bỏ phiếu" value="187" suffix="/ 248" progress={pct} note="75.4% cử tri đã bỏ phiếu"/><StatCard icon={<Clock3 size={18}/>} tint="orange" label="Thời gian còn lại" value="02" suffix="ngày 14 giờ" note="Kết thúc 23:59, 24/11/2025"/><StatCard icon={<ShieldCheck size={18}/>} tint="blue" label="Trạng thái kỳ bầu cử" value="Đang mở" badge/> </div>
          <div className="mid-grid"><section className="panel progress-panel"><PanelTitle title="Tiến độ bầu cử" subtitle="Tình trạng tham gia theo từng vòng" action="Chi tiết" onAction={() => setTab('results')}/><div className="round-progress"><div className="round-icon green-round"><Check size={17}/></div><div className="round-info"><div><b>Vòng 1 · Bầu chọn 11 thành viên</b><span className="status-chip done">ĐANG DIỄN RA</span></div><p>Chọn 11 Huynh trưởng vào Ban điều hành</p><ProgressBar value={75} color="green"/><small>187 <i>/ 248 Huynh trưởng</i><b>75%</b></small></div></div><div className="round-progress"><div className="round-icon gray-round"><Vote size={17}/></div><div className="round-info"><div><b>Vòng 2 · Bầu chọn Ban Thường vụ</b><span className="status-chip pending">CHƯA MỞ</span></div><p>Bầu 5 thành viên Ban Thường vụ từ 11 người</p><ProgressBar value={0} color="gray"/><small>Chờ hoàn tất vòng 1<i/><b>—</b></small></div></div><div className="panel-footer"><div className="avatar-stack">{['peach','lavender','blue','mint','sand'].map((color,i)=><Avatar key={i} person={{ initials: ['AN','TM','PC','LV','VK'][i], color }} size="tiny"/>)}</div><span><b>187 Huynh trưởng</b> đã hoàn thành phiếu</span><button onClick={() => setTab('results')}>Xem danh sách <ChevronRight size={15}/></button></div></section>
          <section className="panel activity-panel"><PanelTitle title="Hoạt động gần đây" subtitle="Cập nhật mới nhất từ kỳ bầu cử" action="Xem tất cả" onAction={() => setTab('results')}/><div className="activity-list"><Activity color="purple" icon={<Users size={15}/>} title="Danh sách cử tri đã được cập nhật" detail="Thêm 12 Huynh trưởng mới vào danh sách" time="2 giờ trước"/><Activity color="green" icon={<Vote size={15}/>} title="Vòng 1 đang diễn ra" detail="Đã có 187/248 người tham gia bỏ phiếu" time="Hôm qua, 08:30"/><Activity color="orange" icon={<ShieldCheck size={15}/>} title="Kỳ bầu cử được khởi tạo" detail="Admin đoàn đã mở kỳ bầu cử nhiệm kỳ mới" time="20/11/2025"/></div></section></div>
          <section className="panel winners-panel"><PanelTitle title="Danh sách đang dẫn đầu" subtitle="Top 5 Huynh trưởng có số phiếu cao nhất vòng 1" action="Xem tất cả kết quả" onAction={() => setTab('results')}/><div className="table-wrap"><table><thead><tr><th>HẠNG</th><th>HUYNH TRƯỞNG</th><th>NGÀNH</th><th>SỐ PHIẾU</th><th>TỶ LỆ</th><th>TRẠNG THÁI</th></tr></thead><tbody>{ranked.slice(0,5).map((person,index)=><tr key={person.id}><td><span className={`rank ${index===0?'first':''}`}>{String(index+1).padStart(2,'0')}</span></td><td><div className="person-cell"><Avatar person={person} size="small"/><b>{person.name}</b></div></td><td><span className="sector-chip">{person.sector.replace('Ngành ','')}</span></td><td><b>{person.votes}</b> phiếu</td><td><span className="table-progress"><i style={{width:`${Math.round(person.votes/78*100)}%`}}/></span> {Math.round(person.votes/248*100)}%</td><td><span className="status-chip elected"><i/> Đang dẫn đầu</span></td></tr>)}</tbody></table></div></section>
        </>}
        {tab === 'vote' && <div className="vote-layout"><section className="panel ballot-panel"><div className="ballot-top"><div><span className="banner-kicker">PHIẾU BẦU CỬ · VÒNG {round}</span><h2>{round === 1 ? 'Chọn 11 thành viên Ban điều hành' : 'Chọn 5 thành viên Ban Thường vụ'}</h2><p>{round === 1 ? 'Chọn 11 Huynh trưởng mà bạn tín nhiệm. Bạn có thể tự bầu cho mình.' : 'Chọn 5 người trong danh sách 11 thành viên đã trúng cử.'}</p></div><div className="round-switch"><button className={round===1?'selected':''} onClick={() => {setRound(1);setSelected([])}}>Vòng 1</button><button className={round===2?'selected':''} onClick={() => {setRound(2);setSelected([])}}>Vòng 2</button></div></div><div className="ballot-toolbar"><label className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm kiếm Huynh trưởng..."/></label><button className="filter-button"><SlidersHorizontal size={15}/> Tất cả ngành <ChevronDown size={14}/></button><span className="selection-count">Đã chọn <b>{selected.length}</b> / {maxSelection}</span></div><div className="candidate-grid">{ballotCandidates.filter(person=>`${person.name} ${person.sector}`.toLowerCase().includes(query.toLowerCase())).map(person=><button key={person.id} className={`candidate-card ${selected.includes(person.id)?'chosen':''}`} onClick={()=>selectCandidate(person.id)}><Avatar person={person}/><span className="candidate-name"><b>{person.name}</b><small>{person.sector}</small></span><span className={`checkbox ${selected.includes(person.id)?'checked':''}`}>{selected.includes(person.id)&&<Check size={13}/>}</span></button>)}</div><div className="ballot-footer"><span><ShieldCheck size={16}/> Phiếu bầu của bạn được bảo mật</span><button className="primary-button" onClick={submitBallot}>Xác nhận phiếu bầu <ChevronRight size={16}/></button></div></section><aside className="panel ballot-aside"><div className="aside-icon"><ClipboardList size={20}/></div><h3>Hướng dẫn bỏ phiếu</h3><ol><li><span>1</span><p>Chọn đúng <b>{maxSelection} Huynh trưởng</b> mà bạn tín nhiệm.</p></li><li><span>2</span><p>Bạn có thể <b>tự chọn chính mình</b> trong danh sách.</p></li><li><span>3</span><p>Kiểm tra lựa chọn trước khi nhấn xác nhận.</p></li><li><span>4</span><p>Sau khi gửi, phiếu bầu <b>không thể chỉnh sửa</b>.</p></li></ol><div className="aside-note"><ShieldCheck size={15}/><span>Mỗi Huynh trưởng chỉ được bỏ phiếu một lần trong mỗi vòng.</span></div><div className="aside-deadline"><Clock3 size={16}/><span>Hạn bỏ phiếu<b>24/11/2025 · 23:59</b></span></div></aside></div>}
        {tab === 'results' && <section className="panel results-panel"><div className="results-header"><div><span className="banner-kicker">KỲ BẦU CỬ · NHIỆM KỲ 2025 – 2027</span><h2>Kết quả vòng {round}</h2><p>Công khai đầy đủ số phiếu của từng ứng viên.</p></div><button className="outline-button" onClick={()=>notify('Đang chuẩn bị biên bản kết quả...')}><Download size={16}/> Tải biên bản</button></div><div className="result-tabs"><button className={round===1?'selected':''} onClick={()=>setRound(1)}>Vòng 1 · Bầu 11 thành viên</button><button className={round===2?'selected':''} onClick={()=>setRound(2)}>Vòng 2 · Ban Thường vụ</button></div><div className="table-wrap"><table><thead><tr><th>HẠNG</th><th>HUYNH TRƯỞNG</th><th>NGÀNH</th><th>SỐ PHIẾU</th><th>TỶ LỆ PHIẾU</th><th>KẾT QUẢ</th></tr></thead><tbody>{ranked.map((person,index)=><tr key={person.id}><td><span className={`rank ${index<11?'first':''}`}>{String(index+1).padStart(2,'0')}</span></td><td><div className="person-cell"><Avatar person={person} size="small"/><b>{person.name}</b></div></td><td><span className="sector-chip">{person.sector.replace('Ngành ','')}</span></td><td><b>{person.votes}</b> phiếu</td><td><div className="result-vote"><ProgressBar value={Math.round(person.votes/78*100)} color={index<11?'green':'gray'}/><span>{Math.round(person.votes/248*100)}%</span></div></td><td>{index<11?<span className="status-chip elected"><i/> Trúng cử</span>:<span className="status-chip pending">Chưa trúng cử</span>}</td></tr>)}</tbody></table></div>{admin&&<div className="admin-actions"><button className="outline-button" onClick={()=>notify('Đã khóa vòng bầu chọn (bản mẫu).')}><ShieldCheck size={15}/> Khóa vòng bầu chọn</button><button className="primary-button" onClick={()=>notify('Đã ghi nhận kết quả và xử lý đồng phiếu (bản mẫu).')}>Chốt kết quả vòng {round} <Check size={15}/></button></div>}</section>}
        {tab === 'roles' && <section className="panel results-panel"><div className="results-header"><div><span className="banner-kicker">CƠ CẤU BAN ĐIỀU HÀNH</span><h2>Phân công chức vụ nhiệm kỳ</h2><p>Ban Thường vụ tự nhận 5 vị trí; phân công 6 vị trí ngành và truyền thông.</p></div><button className="primary-button" onClick={()=>notify('Phân công đã được lưu (bản mẫu).')}>Lưu phân công <Check size={15}/></button></div><div className="roles-grid">{roles.map((role,index)=>{const pool=index<5?ranked.filter(p=>p.elected).slice(0,5):ranked.filter(p=>p.elected).slice(5);return <div className="role-card" key={role.title}><div className={`role-symbol ${role.color}`}>{role.icon}</div><div className="role-detail"><span>{role.category}</span><b>{role.title}</b><select value={roleAssignments[role.title]||''} onChange={e=>setRoleAssignments({...roleAssignments,[role.title]:e.target.value})}><option value="">Chọn Huynh trưởng</option>{pool.map(person=><option value={person.id} key={person.id}>{person.name}</option>)}</select></div></div>})}</div><div className="aside-note"><ShieldCheck size={15}/> Phân công mẫu minh họa. Cần lưu xác nhận của Ban Thường vụ trước khi công bố.</div></section>}
        {tab === 'members' && <section className="panel results-panel"><div className="results-header"><div><span className="banner-kicker">DANH SÁCH CỬ TRI</span><h2>Huynh trưởng Xứ đoàn</h2><p>248 thành viên · Chỉ admin đoàn được quản lý danh sách.</p></div><button className="primary-button" onClick={()=>notify('Chức năng thêm danh sách sẽ kết nối Firebase.')}>+ Thêm Huynh trưởng</button></div><div className="ballot-toolbar"><label className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm kiếm Huynh trưởng..."/></label><button className="filter-button">Tất cả ngành <ChevronDown size={14}/></button><button className="filter-button">Tất cả trạng thái <ChevronDown size={14}/></button></div><div className="table-wrap"><table><thead><tr><th>HUYNH TRƯỞNG</th><th>NGÀNH</th><th>TRẠNG THÁI</th><th>VÒNG 1</th><th>VÒNG 2</th></tr></thead><tbody>{filtered.map((person,index)=><tr key={person.id}><td><div className="person-cell"><Avatar person={person} size="small"/><b>{person.name}</b></div></td><td><span className="sector-chip">{person.sector.replace('Ngành ','')}</span></td><td><span className="status-chip elected"><i/> Hoạt động</span></td><td><span className="status-chip done">{index<8?'Đã bỏ phiếu':'Chưa bỏ phiếu'}</span></td><td><span className="status-chip pending">Chưa mở</span></td></tr>)}</tbody></table></div></section>}
        <footer className="footer"><span>© 2025 Xứ đoàn Anrê · Giáo xứ Thánh Gia</span><div><span>Được xây dựng với <b>♥</b> và tinh thần phục vụ</span><i/> <button onClick={()=>notify(`Kết nối Firebase: ${firebaseConfigured?'đã cấu hình':'chưa cấu hình'}`)}>Phiên bản 1.0.0</button></div></footer>
      </div>
    </main>
    {notice&&<div className="toast"><span><Check size={15}/></span>{notice}<button onClick={()=>setNotice('')}><X size={15}/></button></div>}
  </div>
}

function StatCard({icon,tint,label,value,suffix,change,note,progress,badge}){return <div className="stat-card"><div className="stat-top"><div className={`stat-icon ${tint}`}>{icon}</div>{change&&<span className="stat-change">{change}</span>}{badge&&<span className="status-chip elected"><i/> ĐANG DIỄN RA</span>}</div><span className="stat-label">{label}</span><div className="stat-value">{value}{suffix&&<small>{suffix}</small>}</div>{progress!==undefined?<><ProgressBar value={progress} color="green"/><span className="stat-note">{note}</span></>:<span className="stat-note">{note}</span>}</div>}
function ProgressBar({value,color}){return <div className={`progress-bar ${color}`}><i style={{width:`${value}%`}}/></div>}
function PanelTitle({title,subtitle,action,onAction}){return <div className="panel-title"><div><h3>{title}</h3><p>{subtitle}</p></div><button onClick={onAction}>{action}<ChevronRight size={14}/></button></div>}
function Activity({color,icon,title,detail,time}){return <div className="activity-row"><div className={`activity-icon ${color}`}>{icon}</div><div><b>{title}</b><p>{detail}</p><small>{time}</small></div></div>}

export default App
