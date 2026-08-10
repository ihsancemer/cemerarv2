import React, { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { ARButton, XR, useHitTest } from '@react-three/xr';
import { useGLTF } from '@react-three/drei';
import { supabase } from '../supabase';
import './ArPlayground.css';

// GLB yükleyici bileşen
const ModelInstance = ({ position, url }) => {
  const { scene } = useGLTF(url);
  const clone = React.useMemo(() => scene.clone(), [scene]);
  return <primitive object={clone} position={position} />;
};

// Yüzey tarayıcı (hedef işareti)
const Reticle = ({ onPlace, isReady }) => {
  const reticleRef = useRef();

  useHitTest((hitMatrix) => {
    if (reticleRef.current) {
      hitMatrix.decompose(
        reticleRef.current.position,
        reticleRef.current.quaternion,
        reticleRef.current.scale
      );
      // Reticle sadece yüzey bulunursa görünür olsun
      reticleRef.current.visible = true; 
    }
  });

  return (
    <mesh 
      ref={reticleRef} 
      rotation-x={-Math.PI / 2} 
      visible={false}
      onClick={(e) => {
        if(isReady && reticleRef.current.visible) {
          onPlace(reticleRef.current.position.clone());
        }
      }}
    >
      <ringGeometry args={[0.1, 0.15, 32]} />
      <meshBasicMaterial color={isReady ? "#19b0c7" : "#ff0000"} />
    </mesh>
  );
};

export default function ArPlayground() {
  const [models, setModels] = useState([]);
  const [placedObjects, setPlacedObjects] = useState([]);
  const [activeModel, setActiveModel] = useState(null);
  const [isAR, setIsAR] = useState(false);
  
  useEffect(() => {
    const fetchModels = async () => {
      const { data } = await supabase.from('models').select('*').order('created_at', { ascending: false });
      if (data) setModels(data);
    };
    fetchModels();
  }, []);

  const handlePlace = (position) => {
    if (!activeModel) return;
    const url = supabase.storage.from('models').getPublicUrl(`${activeModel.name}-3d.glb`).data.publicUrl;
    setPlacedObjects(prev => [...prev, { position, url, id: Date.now() }]);
  };

  const handleClear = () => setPlacedObjects([]);

  return (
    <div className="playground-wrapper">
      {!isAR && (
        <div className="playground-intro">
          <h2>AR Sahne Kurucu</h2>
          <p>Kütüphanenizdeki ürünleri tek bir sahnede gerçek dünyaya dizebilirsiniz.</p>
          <div className="intro-models">
             {models.slice(0, 6).map(m => {
                const thumbUrl = supabase.storage.from('models').getPublicUrl(`${m.name}-thumb.webp`).data.publicUrl;
                return <img key={m.id} src={thumbUrl} alt={m.name} />
             })}
          </div>
          <p style={{fontSize: '13px', color: '#888', marginTop: '20px'}}>*Bu özellik WebXR destekli Android Chrome tarayıcılarında çalışır.</p>
        </div>
      )}

      <ARButton 
        className="ar-trigger-btn"
        sessionInit={{ 
          requiredFeatures: ['hit-test'], 
          optionalFeatures: ['dom-overlay'], 
          domOverlay: { root: document.getElementById('ar-overlay') } 
        }}
        onSessionStart={() => setIsAR(true)}
        onSessionEnd={() => setIsAR(false)}
      >
        SAHNEYİ BAŞLAT
      </ARButton>

      <div className="canvas-container" style={{ display: isAR ? 'block' : 'none' }}>
        <Canvas>
          <XR>
            <ambientLight intensity={1.5} />
            <directionalLight position={[5, 10, 5]} intensity={1.5} />
            <Reticle onPlace={handlePlace} isReady={!!activeModel} />
            
            {placedObjects.map(obj => (
              <React.Suspense key={obj.id} fallback={null}>
                <ModelInstance position={obj.position} url={obj.url} />
              </React.Suspense>
            ))}
          </XR>
        </Canvas>
      </div>

      <div id="ar-overlay" style={{ display: isAR ? 'flex' : 'none' }}>
        <div className="overlay-header">
            <span>{placedObjects.length} Ürün Yerleştirildi</span>
            <button onClick={handleClear} className="clear-btn">Temizle</button>
        </div>

        {activeModel && (
          <div className="instruction-toast">
            Ekrana dokunarak ürünü yerleştirin
          </div>
        )}

        <div className="model-carousel">
          {models.map(m => {
             const thumbUrl = supabase.storage.from('models').getPublicUrl(`${m.name}-thumb.webp`).data.publicUrl;
             const isActive = activeModel?.id === m.id;
             return (
               <div 
                 key={m.id} 
                 className={`carousel-item ${isActive ? 'active' : ''}`}
                 onClick={() => setActiveModel(m)}
               >
                 <img src={thumbUrl} alt={m.name} onError={(e) => { e.target.src = 'https://via.placeholder.com/60?text=Model' }} />
                 <div className="item-name">{m.name.toUpperCase()}</div>
               </div>
             )
          })}
        </div>
      </div>
    </div>
  );
}
