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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const rawId = decodeURIComponent(params.get('model') || params.get('id') || "");
    
    const cleanedId = rawId.trim().toLowerCase()
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/[^a-z0-9-]/g, '_').replace(/__+/g, '_').replace(/^_|_$/g, '');
        
    if (!cleanedId) {
      setErrorMsg("Ürün ismi bulunamadı.");
      return;
    }
    
    setModelId(cleanedId);
    
    const baseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || 'https://oeiqrtnvlqzzxivpqogf.supabase.co';
    const bucketPath = `${baseUrl}/storage/v1/object/public/models/`;
    
    const mUrl = `${bucketPath}${cleanedId}-3d.glb`;
    const vUrl = `${bucketPath}${cleanedId}-vars.json?t=${Date.now()}`;
    
    setModelUrl(mUrl);
    
    // Fetch variations
    fetch(vUrl)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setVariations(data);
      })
      .catch(() => console.warn("Varyasyon dosyası yok veya bozuk."));
      
  }, [location]);

  useEffect(() => {
    const mv = mvRef.current;
    if (!mv) return;

    const handleProgress = (ev) => {
      setProgress(ev.detail.totalProgress * 100);
    };

    const handleLoad = () => {
      console.log("✅ Model başarıyla yüklendi.");
      setIsLoading(false);
    };

    const handleError = (e) => {
      console.error("❌ Model Yükleme Hatası:", e);
      setErrorMsg(`"${modelId}" dosyasına erişilemiyor.\nSunucudan hatalı yanıt geldi.`);
      setIsLoading(false);
    };

    mv.addEventListener('progress', handleProgress);
    mv.addEventListener('load', handleLoad);
    mv.addEventListener('error', handleError);

    return () => {
      mv.removeEventListener('progress', handleProgress);
      mv.removeEventListener('load', handleLoad);
      mv.removeEventListener('error', handleError);
    };
  }, [modelId, modelUrl]);

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
      {(isLoading || errorMsg) && (
        <div className="status-ov" style={{ opacity: isLoading || errorMsg ? 1 : 0, pointerEvents: (isLoading || errorMsg) ? 'auto' : 'none' }}>
          {!errorMsg ? (
            <>
              <div className="status-spinner"></div>
              <div style={{ fontWeight: 600, color: '#444' }}>Ürün Hazırlanıyor...</div>
              <div className="load-bar">
                <div className="load-fill" style={{ width: `${progress}%` }}></div>
              </div>
            </>
          ) : (
            <div className="error-card">
              <h3 style={{ color: '#ef4444', margin: '0 0 10px 0' }}>Model Açılamadı</h3>
              <p style={{ fontSize: '14px', color: '#666', lineHeight: 1.5, marginBottom: '20px' }}>
                {errorMsg}
              </p>
              <button onClick={() => window.location.reload()} className="variant-btn" style={{ background: '#f0f0f0' }}>Tekrar Dene</button>
            </div>
          )}
        </div>
      )}

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

      {modelUrl && (
        <model-viewer
          ref={mvRef}
          src={modelUrl}
          ar
          ar-modes="webxr scene-viewer quick-look"
          ar-scale="fixed"
          ar-placement="floor"
          xr-environment
          camera-controls
          touch-action="pan-y"
          shadow-intensity="2"
          shadow-softness="1"
          environment-image="neutral"
          exposure="1.2"
          auto-rotate
          rotation-speed="0.5"
          interpolation-decay="200"
          loading="eager"
          crossorigin="anonymous"
          alt="Cemer 3D Ürün Modeli"
        >
          <button slot="ar-button" className="ar-button">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M7 11V7H11V5H7C5.9 5 5 5.9 5 7V11H7ZM17 7V11H19V7C19 5.9 18.1 5 17 5H13V7H17ZM17 17H13V19H17C18.1 19 19 18.1 19 17V13H17V17ZM7 17V13H5V17C5 18.1 5.9 19 7 19H11V17H7ZM12 8C9.79 8 8 9.79 8 12C8 14.21 9.79 16 12 16C14.21 16 16 14.21 16 12C16 9.79 14.21 8 12 8Z"/></svg>
            AR'DA GÖR
          </button>
        </model-viewer>
      )}
    </div>
  );
}
