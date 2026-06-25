import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import './Viewer.css';

export default function Viewer() {
  const location = useLocation();
  const mvRef = useRef(null);
  
  const [modelId, setModelId] = useState('');
  const [modelUrl, setModelUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [variations, setVariations] = useState([]);
  const [activeVar, setActiveVar] = useState(null);
  const [arAvailable, setArAvailable] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const rawId = decodeURIComponent(params.get('model') || params.get('id') || "");
    
    const cleanedId = rawId.trim().toLowerCase()
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/[^a-z0-9-]/g, '_').replace(/__+/g, '_').replace(/^_|_$/g, '');
        
    if (!cleanedId) {
      setErrorMsg("Ürün ismi bulunamadı.");
      setIsLoading(false);
      return;
    }
    
    setModelId(cleanedId);
    
    const baseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || 'https://oeiqrtnvlqzzxivpqogf.supabase.co';
    const bucketPath = `${baseUrl}/storage/v1/object/public/models/`;
    
    setModelUrl(`${bucketPath}${cleanedId}-3d.glb`);
    
    fetch(`${bucketPath}${cleanedId}-vars.json?t=${Date.now()}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setVariations(data); })
      .catch(() => {});
  }, [location]);

  useEffect(() => {
    const mv = mvRef.current;
    if (!mv || !modelUrl) return;

    // model-viewer özelliklerini doğrudan DOM'a yaz (React web component uyumsuzluk sorunu için)
    mv.setAttribute('src', modelUrl);
    mv.setAttribute('ar', '');
    mv.setAttribute('ar-modes', 'scene-viewer webxr quick-look');
    mv.setAttribute('ar-scale', 'fixed');
    mv.setAttribute('ar-placement', 'floor');
    mv.setAttribute('camera-controls', '');
    mv.setAttribute('touch-action', 'pan-y');
    mv.setAttribute('shadow-intensity', '1.5');
    mv.setAttribute('shadow-softness', '0.8');
    mv.setAttribute('environment-image', 'neutral');
    mv.setAttribute('exposure', '1.2');
    mv.setAttribute('auto-rotate', '');
    mv.setAttribute('rotation-speed', '0.5');
    mv.setAttribute('interpolation-decay', '200');
    mv.setAttribute('loading', 'eager');
    mv.setAttribute('crossorigin', 'anonymous');

    const handleProgress = (ev) => setProgress(ev.detail.totalProgress * 100);
    const handleLoad = () => {
      setIsLoading(false);
      // AR desteği kontrolü
      setArAvailable(mv.canActivateAR === true || typeof mv.activateAR === 'function');
    };
    const handleError = () => {
      setErrorMsg(`"${modelId}" modeline erişilemiyor.`);
      setIsLoading(false);
    };
    const handleArStatus = (ev) => {
      console.log('AR Status:', ev.detail.status);
    };

    mv.addEventListener('progress', handleProgress);
    mv.addEventListener('load', handleLoad);
    mv.addEventListener('error', handleError);
    mv.addEventListener('ar-status', handleArStatus);

    return () => {
      mv.removeEventListener('progress', handleProgress);
      mv.removeEventListener('load', handleLoad);
      mv.removeEventListener('error', handleError);
      mv.removeEventListener('ar-status', handleArStatus);
    };
  }, [modelUrl, modelId]);

  const handleArClick = () => {
    const mv = mvRef.current;
    if (!mv) return;
    if (typeof mv.activateAR === 'function') {
      mv.activateAR();
    } else {
      alert("Bu cihaz veya tarayıcı AR'ı desteklemiyor.\n\nAndroid: Chrome kullanın ve Google Play Services for AR'ın yüklü olduğundan emin olun.\niOS: Safari kullanın.");
    }
  };

  const applyVariation = (v) => {
    setActiveVar(v.name);
    const mv = mvRef.current;
    if (!mv || !mv.model) return;
    for (const mat of mv.model.materials) {
      if (v.colors[mat.name]) {
        mat.pbrMetallicRoughness.setBaseColorFactor(v.colors[mat.name]);
      }
    }
  };

  return (
    <div className="viewer-wrapper">
      {/* Yükleme / Hata ekranı */}
      {(isLoading || errorMsg) && (
        <div className="status-ov">
          {!errorMsg ? (
            <>
              <div className="status-spinner"></div>
              <div style={{ fontWeight: 600, color: '#444', marginBottom: 10 }}>Ürün Hazırlanıyor...</div>
              <div className="load-bar">
                <div className="load-fill" style={{ width: `${progress}%` }}></div>
              </div>
            </>
          ) : (
            <div className="error-card">
              <h3 style={{ color: '#ef4444', margin: '0 0 10px 0' }}>Model Açılamadı</h3>
              <p style={{ fontSize: '14px', color: '#666', lineHeight: 1.5, marginBottom: 20 }}>{errorMsg}</p>
              <button onClick={() => window.location.reload()} className="variant-btn" style={{ background: '#f0f0f0' }}>
                Tekrar Dene
              </button>
            </div>
          )}
        </div>
      )}

      {/* Varyasyon butonları */}
      {variations.length > 0 && (
        <div className="variant-container">
          {variations.map((v, i) => (
            <button
              key={i}
              className={`variant-btn ${activeVar === v.name ? 'active' : ''}`}
              onClick={() => applyVariation(v)}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}

      {/* AR Butonu - React tarafından yönetilen */}
      {!isLoading && !errorMsg && (
        <button className="ar-button" onClick={handleArClick}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M7 11V7H11V5H7C5.9 5 5 5.9 5 7V11H7ZM17 7V11H19V7C19 5.9 18.1 5 17 5H13V7H17ZM17 17H13V19H17C18.1 19 19 18.1 19 17V13H17V17ZM7 17V13H5V17C5 18.1 5.9 19 7 19H11V17H7ZM12 8C9.79 8 8 9.79 8 12C8 14.21 9.79 16 12 16C14.21 16 16 14.21 16 12C16 9.79 14.21 8 12 8Z"/>
          </svg>
          GERÇEK DÜNYADA GÖR
        </button>
      )}

      {/* model-viewer — sadece konteyner, özellikler useEffect ile set ediliyor */}
      <model-viewer ref={mvRef} alt="Cemer 3D Ürün Modeli" style={{ width: '100%', height: '100%' }} />

      {/* Watermark */}
      <div style={{
        position: 'absolute',
        bottom: '8px',
        right: '12px',
        fontSize: '10px',
        color: 'rgba(0,0,0,0.4)',
        fontFamily: 'Outfit, sans-serif',
        fontWeight: '600',
        pointerEvents: 'none',
        zIndex: 5
      }}>
        Cemer IT tarafından geliştirildi
      </div>
    </div>
  );
}
