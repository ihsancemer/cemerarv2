import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useNavigate, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';

export default function Dashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [allModels, setAllModels] = useState([]);
  const [serials, setSerials] = useState([]);
  const [currentSerialFilter, setCurrentSerialFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [linkModalData, setLinkModalData] = useState(null); // { name: '', url: '' }
  const [toastMsg, setToastMsg] = useState('');

  const BASE_URL = window.location.origin;

  useEffect(() => {
    const init = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        navigate('/');
        return;
      }

      setCurrentUser(session.user);
      loadModels(session.user.id);
    };
    init();
  }, [navigate]);

  const loadModels = async (userId) => {
    setIsLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('models')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Supabase Veritabanı Hatası:", error.message);
      setError(`Veri yüklenemedi: ${error.message}`);
    } else {
      const models = data || [];
      setAllModels(models);

      const uniqueSerials = [...new Set(models.map(m => m.serial_code).filter(s => s && s.trim() !== ""))].sort();
      setSerials(uniqueSerials);
    }
    setIsLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleCopyLink = () => {
    if (linkModalData) {
      navigator.clipboard.writeText(linkModalData.url).then(() => showToast("Kopyalandı!"));
    }
  };

  const handleDeleteModel = async (id, name) => {
    if (!window.confirm(`"${name}" ürününü kütüphaneden silmek istediğinize emin misiniz?`)) return;
    try {
      // Storage dosyalarını temizle
      await supabase.storage.from('models').remove([`${name}-3d.glb`, `${name}-thumb.webp`, `${name}-vars.json`]);
      // Veritabanı kaydını sil
      const { error } = await supabase.from('models').delete().eq('id', id);
      if (error) throw error;

      showToast("Ürün silindi.");
      loadModels(currentUser.id);
    } catch (err) {
      alert("Silme hatası: " + err.message);
    }
  };

  const handleDownloadGLB = async (name) => {
    try {
      showToast("İndiriliyor...");
      const { data } = supabase.storage.from('models').getPublicUrl(`${name}-3d.glb`);
      if (data && data.publicUrl) {
        const response = await fetch(data.publicUrl);
        if (!response.ok) throw new Error("Dosya bulunamadı");
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = `${name}.glb`;
        document.body.appendChild(a);
        a.click();

        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);
      } else {
        showToast("İndirme linki alınamadı.");
      }
    } catch (err) {
      alert("İndirme hatası: " + err.message);
    }
  };

  // Filter & Sort Logic
  let filteredModels = [...allModels];

  if (currentSerialFilter !== 'all') {
    filteredModels = filteredModels.filter(m => m.serial_code === currentSerialFilter);
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filteredModels = filteredModels.filter(m =>
      (m.name && m.name.toLowerCase().includes(term)) ||
      (m.serial_code && m.serial_code.toLowerCase().includes(term))
    );
  }

  filteredModels.sort((a, b) => {
    switch (sortBy) {
      case 'date-desc': return new Date(b.created_at) - new Date(a.created_at);
      case 'date-asc': return new Date(a.created_at) - new Date(b.created_at);
      case 'name-asc': return (a.name || "").localeCompare(b.name || "");
      case 'name-desc': return (b.name || "").localeCompare(a.name || "");
      default: return 0;
    }
  });

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-logo">CEMER <span>AR STUDIO</span></div>
        <nav className="sidebar-nav">
          <div className="nav-section-title">Kütüphane</div>
          <button
            className={`nav-item ${currentSerialFilter === 'all' ? 'active' : ''}`}
            onClick={() => setCurrentSerialFilter('all')}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--cemer-turk)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px'}}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            Tüm Modeller
          </button>

          <div className="nav-section-title">Ürün Serileri</div>
          <div id="serial-tabs">
            {serials.map(s => (
              <button
                key={s}
                className={`nav-item ${currentSerialFilter === s ? 'active' : ''}`}
                onClick={() => setCurrentSerialFilter(s)}
                style={{ display: 'flex', alignItems: 'center' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--cemer-turk)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px'}}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                {s}
              </button>
            ))}
          </div>

          <div className="nav-section-title">Araçlar</div>
          <Link className="nav-item" to="/upload" style={{ display: 'flex', alignItems: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--cemer-turk)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px'}}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
            Pro Editor
          </Link>

        </nav>

        {currentUser && (
          <div className="sidebar-user" id="user-box">
            <div className="sidebar-user-name" title={currentUser.email}>{currentUser.email}</div>
            <div className="sidebar-user-email">Cemer Holding Oturumu</div>
            <button className="btn-signout" onClick={handleSignOut}>Çıkış Yap</button>
          </div>
        )}
      </aside>

      <main className="main">
        <div className="topbar">
          <span style={{ fontWeight: 700, fontSize: '18px' }}>Panele Hoşgeldiniz</span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => loadModels(currentUser?.id)} className="btn-sm" style={{ width: 'auto', padding: '0 15px' }}>
              🔄 Yenile
            </button>
            <Link to="/upload" className="btn-upload">+ Yeni Model Tasarla</Link>
          </div>
        </div>

        <div className="content">
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Toplam Ürün</div>
              <div className="stat-value">{allModels.length} <span>adet</span></div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Aktif Seri</div>
              <div className="stat-value" style={{ color: 'var(--accent)' }}>{serials.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Durum</div>
              <div className="stat-value" style={{ fontSize: '24px', color: 'var(--green)' }}>Yayında</div>
            </div>
          </div>

          <div className="library-header">
            <div>
              <div id="current-tab-title" style={{ fontWeight: 700, fontSize: '20px', marginBottom: '4px' }}>
                {currentSerialFilter === 'all' ? 'Tüm Modeller' : `${currentSerialFilter} Serisi`}
              </div>
              <div style={{ color: 'var(--text3)', fontSize: '13px' }}>({filteredModels.length} Ürün Listeleniyor)</div>
            </div>
            <div className="search-box">
              <i>🔍</i>
              <input
                type="text"
                placeholder="İsim veya seri kodu ile ara..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="filter-group">
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="date-desc">En Yeni Eklenen</option>
                <option value="date-asc">En Eski Eklenen</option>
                <option value="name-asc">İsim (A-Z)</option>
                <option value="name-desc">İsim (Z-A)</option>
              </select>
            </div>
          </div>

          <div className="model-grid">
            {isLoading ? (
              <div style={{ padding: '40px', color: 'var(--text3)' }}>Modeller yükleniyor...</div>
            ) : error ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--red)' }}>{error}</div>
            ) : filteredModels.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '80px', border: '2px dashed var(--border)', borderRadius: '12px', background: 'var(--bg2)' }}>
                <div style={{ fontSize: '40px', marginBottom: '15px' }}>🔍</div>
                <div style={{ fontWeight: 700, marginBottom: '5px' }}>Model Bulunamadı</div>
                <div style={{ color: 'var(--text3)', fontSize: '13px' }}>Arama kriterlerinize uygun model bulunmuyor veya henüz yüklenmemiş.</div>
              </div>
            ) : (
              filteredModels.map(m => {
                const { data: thumbData } = supabase.storage.from('models').getPublicUrl(`${m.name}-thumb.webp`);
                const thumbUrlWithCache = `${thumbData.publicUrl}?t=${new Date(m.created_at).getTime()}`;
                const dateStr = new Date(m.created_at).toLocaleDateString('tr-TR');

                return (
                  <div className="model-card" key={m.id}>
                    <div className="model-thumb">
                      <img
                        src={thumbUrlWithCache}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { e.target.src = 'https://via.placeholder.com/300x180?text=Gorsel+Yukleniyor' }}
                        alt={m.name}
                      />
                    </div>
                    <div className="model-body">
                      <div className="model-name">{(m.name || "İsimsiz Model").toUpperCase()}</div>
                      <div className="model-meta">
                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Seri: {m.serial_code || 'Genel'}</span>
                        <span>{dateStr}</span>
                      </div>
                      <div className="model-actions">
                        <Link to={`/upload?edit=${encodeURIComponent(m.name)}`} className="btn-sm" style={{ background: 'var(--bg2)' }}>✏️ Düzenle</Link>
                        <Link to={`/viewer?model=${m.name}`} target="_blank" className="btn-sm" rel="noopener noreferrer">👁️ Gözat</Link>
                        <button className="btn-sm" style={{ background: 'var(--bg2)' }} onClick={() => handleDownloadGLB(m.name)} title="GLB İndir">⬇️ İndir</button>
                        <button className="btn-sm danger" onClick={() => handleDeleteModel(m.id, m.name)} title="Sil">🗑️</button>
                      </div>
                      <button
                        className="btn-sm primary"
                        style={{ width: '100%', marginTop: '8px' }}
                        onClick={() => setLinkModalData({ name: m.name, url: `${BASE_URL}/viewer?model=${encodeURIComponent(m.name)}` })}
                      >
                        🔗 Paylaş & QR
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* QR & Link Modal */}
      <div className={`modal-backdrop ${linkModalData ? 'open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setLinkModalData(null); }}>
        {linkModalData && (
          <div className="modal">
            <h3>{linkModalData.name.toUpperCase()}</h3>
            <p style={{ fontSize: '13px', color: 'var(--text2)', margin: '10px 0' }}>AR deneyimi için QR kodu müşterilerinizle paylaşın.</p>
            <div className="qr-code-wrapper">
              <QRCodeSVG value={linkModalData.url} size={180} />
            </div>
            <div className="url-box">{linkModalData.url}</div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn-sm primary" onClick={handleCopyLink}>Kopyala</button>
              <button className="btn-sm" onClick={() => setLinkModalData(null)}>Kapat</button>
            </div>
          </div>
        )}
      </div>

      {/* Toast Notification */}
      <div className={`toast ${toastMsg ? 'show' : ''}`}>
        {toastMsg}
      </div>
    </>
  );
}
