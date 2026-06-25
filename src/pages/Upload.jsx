import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import './Upload.css';

export default function Upload() {
  const navigate = useNavigate();
  const location = useLocation();
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const texInputRef = useRef(null);

  const engine = useRef({
    scene: null, camera: null, renderer: null, orbit: null, 
    currentModel: null, grid: null, selectionBox: null, sunLight: null,
    selectedMesh: null, composer: null, bloomPass: null, reqId: null
  });

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  
  const [saveName, setSaveName] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [saveSerial, setSaveSerial] = useState('');
  
  const [varName, setVarName] = useState('');
  const [variations, setVariations] = useState([]);
  
  const [hasSelection, setHasSelection] = useState(false);
  const [meshName, setMeshName] = useState('-');
  const [meshColor, setMeshColor] = useState('#ffffff');
  const [meshSaturation, setMeshSaturation] = useState(1);
  const [texScale, setTexScale] = useState(0.05);
  const [texRotate, setTexRotate] = useState(0);
  const [meshOpacity, setMeshOpacity] = useState(1);
  const [meshMetal, setMeshMetal] = useState(0);

  const [exposure, setExposure] = useState(1.5);
  const [sunAngle, setSunAngle] = useState(45);
  const [bloomStrength, setBloomStrength] = useState(0.5);
  const [bloomRadius, setBloomRadius] = useState(0.4);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate('/');
    });

    initThree();
    checkEditMode();

    return () => {
      if (engine.current.reqId) cancelAnimationFrame(engine.current.reqId);
      if (engine.current.renderer) {
        engine.current.renderer.dispose();
      }
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, []);

  const initThree = () => {
    const e = engine.current;
    e.scene = new THREE.Scene();
    e.scene.background = new THREE.Color(0x0d0d0f);
    
    // Initial size calculation
    const container = containerRef.current;
    const viewportW = container.clientWidth || (window.innerWidth - 300);
    const viewportH = container.clientHeight || (window.innerHeight - 52);
    
    e.camera = new THREE.PerspectiveCamera(45, viewportW / viewportH, 0.1, 1000);
    e.camera.position.set(4, 4, 4);
    
    e.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    e.renderer.setSize(viewportW, viewportH);
    e.renderer.setPixelRatio(window.devicePixelRatio);
    e.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    e.renderer.toneMappingExposure = exposure;
    container.appendChild(e.renderer.domElement);
    
    e.orbit = new OrbitControls(e.camera, e.renderer.domElement);
    e.orbit.enableDamping = true;
    
    const pmrem = new THREE.PMREMGenerator(e.renderer);
    e.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    
    e.sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
    updateSunPosition(sunAngle, e.sunLight);
    e.scene.add(e.sunLight);
    e.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    
    e.grid = new THREE.GridHelper(20, 20, 0x2a2a2e, 0x1a1a1e);
    e.scene.add(e.grid);
    
    e.selectionBox = new THREE.BoxHelper(new THREE.Mesh(), 0x19b0c7);
    e.selectionBox.visible = false;
    e.scene.add(e.selectionBox);
    
    e.composer = new EffectComposer(e.renderer);
    e.composer.addPass(new RenderPass(e.scene, e.camera));
    e.bloomPass = new UnrealBloomPass(new THREE.Vector2(viewportW, viewportH), bloomStrength, bloomRadius, 0.85);
    e.composer.addPass(e.bloomPass);
    e.composer.addPass(new OutputPass());

    // Raycaster logic
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (event) => {
      if (!e.currentModel) return;
      const rect = e.renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, e.camera);
      const hits = raycaster.intersectObject(e.currentModel, true);
      if (hits.length > 0 && hits[0].object.isMesh) {
        selectPart(hits[0].object);
      } else {
        deselectPart();
      }
    };
    
    container.addEventListener('pointerdown', onPointerDown);

    const animate = () => {
      e.reqId = requestAnimationFrame(animate);
      e.orbit.update();
      e.composer.render();
    };
    animate();

    const handleResize = () => {
        if(!containerRef.current || !e.renderer) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        e.camera.aspect = w / h;
        e.camera.updateProjectionMatrix();
        e.renderer.setSize(w, h);
        e.composer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);
    // Return cleanup inner is not directly possible here, but handled in useEffect return
  };

  const updateSunPosition = (angleDeg, lightObj) => {
    const angle = angleDeg * (Math.PI / 180);
    if(lightObj) lightObj.position.set(Math.cos(angle) * 10, 8, Math.sin(angle) * 10);
  };

  const checkEditMode = async () => {
    const params = new URLSearchParams(location.search);
    const editName = params.get('edit');
    if (!editName) return;
    
    setIsEditMode(true);
    showLoading("MODEL YÜKLENİYOR...");
    
    try {
        const { data: dbData } = await supabase.from('models').select('*').eq('name', editName).single();
        if (dbData) {
            setSaveName(dbData.name);
            setSaveSerial(dbData.serial_code || "");
            setExposure(dbData.exposure || 1.5);
            if(engine.current.renderer) engine.current.renderer.toneMappingExposure = dbData.exposure || 1.5;
        }
        
        const { data: glbRes } = supabase.storage.from('models').getPublicUrl(`${editName}-3d.glb`);
        
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);
        
        loader.load(glbRes.publicUrl, (gltf) => {
            const e = engine.current;
            e.currentModel = gltf.scene; 
            e.scene.add(e.currentModel);
            e.currentModel.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(e.currentModel);
            const center = box.getCenter(new THREE.Vector3());
            e.currentModel.position.set(-center.x, -box.min.y, -center.z);
            
            fetch(supabase.storage.from('models').getPublicUrl(`${editName}-vars.json`).data.publicUrl + `?t=${Date.now()}`)
                .then(res => res.ok ? res.json() : [])
                .then(data => { setVariations(data); })
                .finally(() => hideLoading());
        }, undefined, (err) => {
            console.error(err);
            hideLoading();
            alert("Model yüklenemedi.");
        });
    } catch (e) { 
        hideLoading(); 
        console.error(e);
    }
  };

  const selectPart = (mesh) => {
    const e = engine.current;
    e.selectedMesh = mesh;
    if(!e.selectedMesh.material.isCloned) { 
        e.selectedMesh.material = e.selectedMesh.material.clone(); 
        e.selectedMesh.material.isCloned = true; 
    }
    e.selectionBox.setFromObject(e.selectedMesh); 
    e.selectionBox.visible = true;
    
    setHasSelection(true);
    setMeshName(mesh.name || "Mesh");
    setMeshColor("#" + e.selectedMesh.material.color.getHexString());
    setMeshOpacity(e.selectedMesh.material.opacity !== undefined ? e.selectedMesh.material.opacity : 1);
    setMeshMetal(e.selectedMesh.material.metalness !== undefined ? e.selectedMesh.material.metalness : 0);
  };

  const deselectPart = () => {
    engine.current.selectedMesh = null;
    if(engine.current.selectionBox) engine.current.selectionBox.visible = false;
    setHasSelection(false);
  };

  const showLoading = (text) => {
    setLoadingText(text);
    setIsLoading(true);
  };
  const hideLoading = () => setIsLoading(false);

  // File Handlers
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    
    showLoading("MODEL AÇILIYOR...");
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
    loader.setDRACOLoader(dracoLoader);
    
    loader.load(URL.createObjectURL(file), (gltf) => {
        const eng = engine.current;
        if(eng.currentModel) eng.scene.remove(eng.currentModel);
        eng.currentModel = gltf.scene;
        eng.scene.add(eng.currentModel);
        
        eng.currentModel.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(eng.currentModel);
        const center = box.getCenter(new THREE.Vector3());
        eng.currentModel.position.set(-center.x, -box.min.y, -center.z);
        
        hideLoading();
        e.target.value = ""; 
    }, undefined, (err) => {
        console.error(err);
        hideLoading();
        alert("Model yükleme hatası!");
    });
  };

  const handleTexChange = (e) => {
    if(!engine.current.selectedMesh || !e.target.files[0]) return;
    const reader = new FileReader();
    reader.onload = (re) => {
        const img = new Image(); img.src = re.target.result;
        img.onload = () => {
            const tex = new THREE.Texture(img);
            tex.colorSpace = THREE.SRGBColorSpace; 
            tex.flipY = false;
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(texScale, texScale); 
            tex.rotation = THREE.MathUtils.degToRad(texRotate);
            tex.needsUpdate = true;
            engine.current.selectedMesh.material.map = tex; 
            engine.current.selectedMesh.material.needsUpdate = true;
        };
    };
    reader.readAsDataURL(e.target.files[0]);
    e.target.value = "";
  };

  // Mesh Properties updaters
  const updateSelectedMeshColor = (hex, sat) => {
    const { selectedMesh } = engine.current;
    if(!selectedMesh) return;
    const color = new THREE.Color(hex);
    const hsl = {}; color.getHSL(hsl);
    color.setHSL(hsl.h, sat, hsl.l);
    selectedMesh.material.color.copy(color);
  };

  const handleMeshColor = (e) => {
      setMeshColor(e.target.value);
      updateSelectedMeshColor(e.target.value, meshSaturation);
  };
  const handleMeshSaturation = (e) => {
      const v = parseFloat(e.target.value);
      setMeshSaturation(v);
      updateSelectedMeshColor(meshColor, v);
  };
  const handleTexScale = (e) => {
      const v = parseFloat(e.target.value);
      setTexScale(v);
      if(engine.current.selectedMesh?.material.map) {
          engine.current.selectedMesh.material.map.repeat.set(v, v);
      }
  };
  const handleTexRotate = (e) => {
      const v = parseFloat(e.target.value);
      setTexRotate(v);
      if(engine.current.selectedMesh?.material.map) {
          engine.current.selectedMesh.material.map.rotation = THREE.MathUtils.degToRad(v);
      }
  };
  const handleMeshOpacity = (e) => {
      const v = parseFloat(e.target.value);
      setMeshOpacity(v);
      if(engine.current.selectedMesh) {
          engine.current.selectedMesh.material.transparent = v < 1; 
          engine.current.selectedMesh.material.opacity = v;
      }
  };
  const handleMeshMetal = (e) => {
      const v = parseFloat(e.target.value);
      setMeshMetal(v);
      if(engine.current.selectedMesh) {
          engine.current.selectedMesh.material.metalness = v;
      }
  };
  const handleDeleteMesh = () => {
      if(engine.current.selectedMesh) {
          engine.current.selectedMesh.removeFromParent();
          deselectPart();
      }
  };

  // Scene properties updaters
  const handleExposure = (e) => {
      const v = parseFloat(e.target.value);
      setExposure(v);
      if(engine.current.renderer) engine.current.renderer.toneMappingExposure = v;
  };
  const handleSunAngle = (e) => {
      const v = parseFloat(e.target.value);
      setSunAngle(v);
      updateSunPosition(v, engine.current.sunLight);
  };
  const handleBloomStrength = (e) => {
      const v = parseFloat(e.target.value);
      setBloomStrength(v);
      if(engine.current.bloomPass) engine.current.bloomPass.strength = v;
  };
  const handleBloomRadius = (e) => {
      const v = parseFloat(e.target.value);
      setBloomRadius(v);
      if(engine.current.bloomPass) engine.current.bloomPass.radius = v;
  };

  // Transformations
  const rotateModel = () => { if(engine.current.currentModel) engine.current.currentModel.rotation.y += Math.PI / 2; };
  const snapToFloor = () => { 
      const model = engine.current.currentModel;
      if(model) { 
          const box = new THREE.Box3().setFromObject(model); 
          model.position.y -= box.min.y; 
      } 
  };
  const scaleCM = () => { if(engine.current.currentModel) engine.current.currentModel.scale.multiplyScalar(0.01); };
  const scaleMM = () => { if(engine.current.currentModel) engine.current.currentModel.scale.multiplyScalar(0.001); };

  // Variations
  const handleAddVar = () => {
    if(!engine.current.currentModel) return;
    const name = varName || `Varyasyon ${variations.length + 1}`;
    const config = {};
    engine.current.currentModel.traverse(m => {
        if(m.isMesh && m.material) {
            if(!m.material.name) m.material.name = "mat_" + Math.random().toString(36).substr(2, 5);
            const c = m.material.color;
            config[m.material.name] = [c.r, c.g, c.b, m.material.opacity || 1];
        }
    });
    setVariations([...variations, { name, colors: config }]);
    setVarName('');
  };
  const handleRemoveVar = (index) => {
      const nv = [...variations];
      nv.splice(index, 1);
      setVariations(nv);
  };

  // Save Flow
  const openSaveModal = () => {
      if(!engine.current.currentModel) return alert("Kaydedilecek model yok!");
      setShowSaveModal(true);
  };

  const confirmSave = async () => {
    const rawName = saveName;
    const serial = saveSerial.trim();
    if(!rawName || !serial) return alert("Eksik bilgi!");

    const name = rawName.trim().toLowerCase()
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/[^a-z0-9-]/g, '_').replace(/__+/g, '_').replace(/^_|_$/g, '');

    setShowSaveModal(false);
    showLoading("MODEL PAKETLENİYOR...");

    try {
        const { data: { user }, error: authErr } = await supabase.auth.getUser();
        if (authErr || !user) throw new Error("Oturum hatası! Tekrar giriş yapın.");

        const e = engine.current;
        if (!e.currentModel) throw new Error("Sahne boş!");
        
        e.currentModel.updateMatrixWorld(true);
        e.currentModel.traverse(child => { if(child.isMesh) child.updateMatrixWorld(true); });

        e.grid.visible = false; 
        e.selectionBox.visible = false;
        e.composer.render();
        const thumbBlob = await fetch(e.renderer.domElement.toDataURL("image/webp", 0.8)).then(r => r.blob());
        e.grid.visible = true;

        const exporter = new GLTFExporter();
        const exportOptions = {
            binary: true,
            animations: e.currentModel.animations || [],
            includeCustomExtensions: true,
            onlyVisible: true
        };

        exporter.parse(e.currentModel, async (buffer) => {
            if (!buffer || buffer.byteLength < 100) {
                 alert("Hata: Model dışa aktarılamadı (buffer boş).");
                 hideLoading();
                 return;
            }

            const glbBlob = new Blob([buffer], { type: 'model/gltf-binary' });
            setLoadingText("BULUTA YÜKLENİYOR...");

            await supabase.storage.from('models').upload(`${name}-thumb.webp`, thumbBlob, { upsert: true });
            await supabase.storage.from('models').upload(`${name}-3d.glb`, glbBlob, { upsert: true });
            
            if(variations.length > 0) {
                const vBlob = new Blob([JSON.stringify(variations)], { type: "application/json" });
                await supabase.storage.from('models').upload(`${name}-vars.json`, vBlob, { upsert: true });
            }

            const { error: dbErr } = await supabase.from('models').upsert([{ 
                user_id: user.id, name: name, serial_code: serial, exposure: e.renderer.toneMappingExposure 
            }], { onConflict: 'name' });

            if(dbErr) throw dbErr;
            navigate('/dashboard');
        }, (err) => {
            console.error("Export hatası:", err);
            alert("Export hatası: " + err.message);
            hideLoading();
        }, exportOptions);

    } catch (err) { 
        console.error("KAYIT HATASI:", err);
        alert("Hata: " + err.message); 
        hideLoading(); 
    }
  };

  return (
    <div className="editor-wrapper">
        <div className={`editor-modal-backdrop ${showSaveModal ? 'open' : ''}`}>
            <div className="editor-panel" style={{ maxWidth: '360px', width: '90%', padding: '25px' }}>
                <div style={{ fontWeight: 800, color: 'var(--accent)', marginBottom: '20px', fontSize: '16px' }}>KÜTÜPHANEYE KAYDET</div>
                <label className="editor-label">Ürün İsmi</label>
                <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Örn: Istanbul Serisi Vapur" disabled={isEditMode} />
                <label className="editor-label">Seri Kod / Grup (Sekme Oluşturur)</label>
                <input type="text" value={saveSerial} onChange={e => setSaveSerial(e.target.value)} placeholder="Örn: IST-200 veya Istanbul" />
                <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                    <button className="editor-btn primary" onClick={confirmSave}>KAYDET</button>
                    <button className="editor-btn" onClick={() => setShowSaveModal(false)}>İPTAL</button>
                </div>
            </div>
        </div>

        <div className="editor-topbar">
            <Link to="/dashboard" style={{textDecoration:'none', color:'inherit'}}>
                <div style={{ fontWeight: 800, fontSize: '18px', letterSpacing: '1px' }}>CEMER <span style={{ color: 'var(--accent)' }}>AR STUDIO</span></div>
            </Link>
            <div style={{ flex: 1 }}></div>
            <input type="file" ref={fileInputRef} accept=".glb" style={{ display: 'none' }} onChange={handleFileChange} />
            <button className="editor-btn" style={{ width: 'auto' }} onClick={() => fileInputRef.current?.click()}>📂 Model Aç</button>
            <button className="editor-btn primary" style={{ width: 'auto', marginLeft: '8px' }} onClick={openSaveModal}>☁️ Kütüphaneye Kaydet</button>
        </div>

        <div className="editor-workspace">
            <div className="editor-sidebar">
                <div className="editor-panel">
                    <span className="editor-label">Renk Varyasyonları</span>
                    <input type="text" value={varName} onChange={e => setVarName(e.target.value)} placeholder="Varyasyon İsmi..." />
                    <button className="editor-btn" onClick={handleAddVar}>➕ Varyasyon Olarak Kaydet</button>
                    <div style={{ marginTop: '10px' }}>
                        {variations.map((v, i) => (
                            <div className="editor-var-item" key={i}>
                                <span>{v.name}</span>
                                <button className="editor-btn-del-var" onClick={() => handleRemoveVar(i)}>✕</button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="editor-panel">
                    <span className="editor-label">Ölçek ve Yönlendirme</span>
                    <div style={{ display: 'flex', gap: '5px', marginBottom: '8px' }}>
                        <button className="editor-btn" onClick={scaleCM}>CM ➔ M</button>
                        <button className="editor-btn" onClick={scaleMM}>MM ➔ M</button>
                    </div>
                    <button className="editor-btn" onClick={rotateModel}>🔄 90° Çevir</button>
                    <button className="editor-btn" style={{ marginTop: '6px' }} onClick={snapToFloor}>⬇️ Zemine Hizala</button>
                </div>
                
                {hasSelection && (
                    <div className="editor-panel">
                        <span className="editor-label">Seçili Parça: <span style={{ color: 'var(--accent)' }}>{meshName}</span></span>
                        <span className="editor-label">Renk ve Soldurma</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input type="color" value={meshColor} onChange={handleMeshColor} style={{ flex: 1, marginBottom: 0 }} />
                            <input type="range" min="0" max="1" step="0.05" value={meshSaturation} onChange={handleMeshSaturation} title="Satürasyon (Soldurma)" style={{ flex: 1, marginBottom: 0 }} />
                        </div>

                        <span className="editor-label" style={{ marginTop: '10px' }}>Doku (Texture) Ayarları</span>
                        <input type="file" ref={texInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleTexChange} />
                        <button className="editor-btn" style={{ marginBottom: '12px' }} onClick={() => texInputRef.current?.click()}>🖼️ Yeni Doku Yükle</button>
                        
                        <span className="editor-label">Doku Ölçeği (Büyüklük)</span>
                        <input type="range" min="0.01" max="0.5" step="0.01" value={texScale} onChange={handleTexScale} />
                        
                        <span className="editor-label">Doku Döndürme (Rotate)</span>
                        <input type="range" min="0" max="360" step="1" value={texRotate} onChange={handleTexRotate} />
                        
                        <span className="editor-label">Opaklık</span>
                        <input type="range" min="0" max="1" step="0.05" value={meshOpacity} onChange={handleMeshOpacity} />

                        <span className="editor-label">Metalik</span>
                        <input type="range" min="0" max="1" step="0.05" value={meshMetal} onChange={handleMeshMetal} />
                        
                        <button className="editor-btn" style={{ borderColor: '#ef4444', color: '#ef4444', marginTop: '8px', background: 'rgba(239,68,68,0.05)' }} onClick={handleDeleteMesh}>🗑️ Parçayı Sil</button>
                    </div>
                )}

                <div className="editor-panel">
                    <span className="editor-label">Sahne Işığı ve HDR</span>
                    <span className="editor-label">Exposure (Pozlama)</span>
                    <input type="range" min="0.1" max="4" step="0.1" value={exposure} onChange={handleExposure} />
                    <span className="editor-label">Güneş Açısı</span>
                    <input type="range" min="0" max="360" step="1" value={sunAngle} onChange={handleSunAngle} />
                    
                    <span className="editor-label" style={{ marginTop: '10px' }}>HDR Glow (Perceived HDR Bloom)</span>
                    <span className="editor-label">Parlaklık Gücü</span>
                    <input type="range" min="0" max="2" step="0.1" value={bloomStrength} onChange={handleBloomStrength} />
                    <span className="editor-label">Yansıma Yarıçapı</span>
                    <input type="range" min="0" max="1" step="0.05" value={bloomRadius} onChange={handleBloomRadius} />
                </div>
            </div>
            
            <div className="editor-viewport" ref={containerRef} tabIndex="0">
                <div className={`editor-loading-ov ${isLoading ? 'open' : ''}`}>
                    <div className="editor-spinner"></div>
                    <div style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '18px', marginTop: '15px' }}>{loadingText}</div>
                </div>
            </div>
        </div>
    </div>
  );
}
