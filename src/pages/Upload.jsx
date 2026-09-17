import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { SelectionBox } from 'three/examples/jsm/interactive/SelectionBox.js';
import './Upload.css';

export default function Upload() {
  const navigate = useNavigate();
  const location = useLocation();
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const texInputRef = useRef(null);

  const engine = useRef({
    scene: null, camera: null, renderer: null, orbit: null, 
    currentModel: null, grid: null, selectionBoxes: [], sunLight: null,
    selectedMeshes: [], transformControl: null, reqId: null,
    selectionBox: null, history: []
  });
  const selectionDivRef = useRef(null);

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  
  const [saveName, setSaveName] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [saveSerial, setSaveSerial] = useState('');
  
  const [varName, setVarName] = useState('');
  const [variations, setVariations] = useState([]);
  
  const [isBoxSelectMode, setIsBoxSelectMode] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [meshName, setMeshName] = useState('-');
  const [meshColor, setMeshColor] = useState('#ffffff');
  const [meshSaturation, setMeshSaturation] = useState(1);
  const [texScale, setTexScale] = useState(0.05);
  const [texRotate, setTexRotate] = useState(0);
  const [meshOpacity, setMeshOpacity] = useState(1);
  const [meshMetal, setMeshMetal] = useState(0);
  const [meshRoughness, setMeshRoughness] = useState(1);

  const [exposure, setExposure] = useState(1.5);
  const [sunAngle, setSunAngle] = useState(45);

  const defaultColors = Array(15).fill('#444444');
  const [paletteColors, setPaletteColors] = useState(() => {
    const saved = localStorage.getItem('cemer_ar_palette');
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    return defaultColors;
  });
  const [editingPaletteIndex, setEditingPaletteIndex] = useState(null);
  const paletteInputRef = useRef(null);

  const handlePaletteClick = (color) => {
    if (engine.current.selectedMeshes.length > 0) {
      setMeshColor(color);
      updateSelectedMeshColor(color, meshSaturation);
    }
  };

  const triggerColorEdit = (index) => {
    setEditingPaletteIndex(index);
    if (paletteInputRef.current) {
      paletteInputRef.current.click();
    }
  };

  const handlePaletteColorChange = (e) => {
    if (editingPaletteIndex === null) return;
    const newColors = [...paletteColors];
    newColors[editingPaletteIndex] = e.target.value;
    setPaletteColors(newColors);
    localStorage.setItem('cemer_ar_palette', JSON.stringify(newColors));
  };


  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate('/');
    });

    initThree();
    checkEditMode();

    const handleKeyDown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            undoLastAction();
        }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (engine.current.reqId) cancelAnimationFrame(engine.current.reqId);
      if (engine.current.renderer) {
        engine.current.renderer.dispose();
      }
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, []);

  const saveHistory = (type, customData = null) => {
      const h = engine.current.history;
      const selected = engine.current.selectedMeshes;
      
      if (type === 'delete') {
          if(selected.length === 0) return;
          h.push({ type: 'delete', meshes: [...selected], parents: selected.map(m => m.parent) });
      } else if (type === 'material') {
          if(selected.length === 0) return;
          const states = selected.map(m => ({
              mesh: m, color: m.material.color.clone(), opacity: m.material.opacity,
              transparent: m.material.transparent, metalness: m.material.metalness, roughness: m.material.roughness
          }));
          h.push({ type: 'material', states });
      } else if (type === 'transform') {
          const target = customData ? [customData] : selected;
          if(target.length === 0) return;
          const states = target.map(m => ({
              mesh: m, position: m.position.clone(), rotation: m.rotation.clone(), scale: m.scale.clone()
          }));
          h.push({ type: 'transform', states });
      }
      
      if (h.length > 50) h.shift();
  };

  const undoLastAction = () => {
      const h = engine.current.history;
      if (h.length === 0) return;
      const action = h.pop();
      
      if (action.type === 'delete') {
          action.meshes.forEach((m, i) => { if(action.parents[i]) action.parents[i].add(m); });
      } else if (action.type === 'material') {
          action.states.forEach(s => {
              s.mesh.material.color.copy(s.color); s.mesh.material.opacity = s.opacity;
              s.mesh.material.transparent = s.transparent; s.mesh.material.metalness = s.metalness;
              s.mesh.material.roughness = s.roughness; s.mesh.material.needsUpdate = true;
          });
          updateUIForSelection();
      } else if (action.type === 'transform') {
          action.states.forEach(s => {
              s.mesh.position.copy(s.position); s.mesh.rotation.copy(s.rotation); s.mesh.scale.copy(s.scale);
          });
      }
  };

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
    
    e.transformControl = new TransformControls(e.camera, e.renderer.domElement);
    e.transformControl.addEventListener('dragging-changed', (event) => {
        e.orbit.enabled = !event.value;
    });
    e.scene.add(e.transformControl);

    e.selectionBox = new SelectionBox(e.camera, e.scene);

    // Raycaster & Box Selection logic
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDrawingBox = false;
    let startPoint = new THREE.Vector2();

    const onPointerDown = (event) => {
      if (!e.currentModel) return;
      if (e.transformControl && e.transformControl.dragging) return;
      
      const rect = e.renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Mode check: Shift key OR UI Toggle Button
      const isBoxModeActive = event.shiftKey || document.body.getAttribute('data-box-select') === 'true';

      if (isBoxModeActive) {
          isDrawingBox = true;
          e.orbit.enabled = false;
          e.selectionBox.startPoint.set(mouse.x, mouse.y, 0.5);
          startPoint.set(event.clientX, event.clientY);
          
          if(selectionDivRef.current) {
              selectionDivRef.current.style.display = 'block';
              selectionDivRef.current.style.left = event.clientX + 'px';
              selectionDivRef.current.style.top = event.clientY + 'px';
              selectionDivRef.current.style.width = '0px';
              selectionDivRef.current.style.height = '0px';
          }
          return;
      }

      raycaster.setFromCamera(mouse, e.camera);
      const hits = raycaster.intersectObject(e.currentModel, true);
      if (hits.length > 0 && hits[0].object.isMesh) {
        selectPart(hits[0].object, event.ctrlKey || event.metaKey);
      } else {
        if (!event.ctrlKey && !event.metaKey) {
          deselectPart();
        }
      }
    };
    
    const onPointerMove = (event) => {
        if (!isDrawingBox) return;
        const rect = e.renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        e.selectionBox.endPoint.set(mouse.x, mouse.y, 0.5);
        
        if(selectionDivRef.current) {
            selectionDivRef.current.style.left = Math.min(event.clientX, startPoint.x) + 'px';
            selectionDivRef.current.style.top = Math.min(event.clientY, startPoint.y) + 'px';
            selectionDivRef.current.style.width = Math.abs(event.clientX - startPoint.x) + 'px';
            selectionDivRef.current.style.height = Math.abs(event.clientY - startPoint.y) + 'px';
        }
    };
    
    const onPointerUp = (event) => {
        if (isDrawingBox) {
            isDrawingBox = false;
            e.orbit.enabled = true;
            if(selectionDivRef.current) selectionDivRef.current.style.display = 'none';
            
            const selected = e.selectionBox.select();
            
            // Eğer CTRL'ye basılıysa mevcut seçime ekle, değilse önce öncekileri temizle
            if (!event.ctrlKey && !event.metaKey) deselectPart();
            
            selected.forEach(mesh => {
                if(mesh.isMesh) selectPart(mesh, true);
            });
        }
    };
    
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);

    const animate = () => {
      e.reqId = requestAnimationFrame(animate);
      e.orbit.update();
      e.renderer.render(e.scene, e.camera);
    };
    animate();

    const handleResize = () => {
        if(!containerRef.current || !e.renderer) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        e.camera.aspect = w / h;
        e.camera.updateProjectionMatrix();
        e.renderer.setSize(w, h);

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
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/'); 
        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);
        
        const glbUrlWithCache = glbRes.publicUrl + `?t=${Date.now()}`;
        
        loader.load(glbUrlWithCache, (gltf) => {
            const e = engine.current;
            e.currentModel = gltf.scene; 
            e.scene.add(e.currentModel);
            e.currentModel.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(e.currentModel);
            const center = box.getCenter(new THREE.Vector3());
            e.currentModel.position.set(-center.x, -box.min.y, -center.z);
            if (e.transformControl) e.transformControl.attach(e.currentModel);
            
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

  const updateUIForSelection = () => {
    const e = engine.current;
    const lastMesh = e.selectedMeshes[e.selectedMeshes.length - 1];
    if (!lastMesh) return;
    
    setMeshName(e.selectedMeshes.length > 1 ? `${e.selectedMeshes.length} Parça Seçili` : (lastMesh.name || "Mesh"));
    setMeshColor("#" + lastMesh.material.color.getHexString());
    setMeshOpacity(lastMesh.material.opacity !== undefined ? lastMesh.material.opacity : 1);
    setMeshMetal(lastMesh.material.metalness !== undefined ? lastMesh.material.metalness : 0);
    setMeshRoughness(lastMesh.material.roughness !== undefined ? lastMesh.material.roughness : 1);
  };

  const selectPart = (mesh, isMultiSelect = false) => {
    const e = engine.current;
    
    if (!isMultiSelect) {
      deselectPart();
    }

    if (e.selectedMeshes.includes(mesh)) {
        if (isMultiSelect) {
            const idx = e.selectedMeshes.indexOf(mesh);
            e.selectedMeshes.splice(idx, 1);
            e.scene.remove(e.selectionBoxes[idx]);
            e.selectionBoxes.splice(idx, 1);
            if (e.selectedMeshes.length === 0) setHasSelection(false);
            else updateUIForSelection();
            return;
        }
    }

    if(!mesh.material.isCloned) { 
        mesh.material = mesh.material.clone(); 
        mesh.material.isCloned = true; 
    }
    
    e.selectedMeshes.push(mesh);
    const boxHelper = new THREE.BoxHelper(mesh, 0x19b0c7);
    e.selectionBoxes.push(boxHelper);
    e.scene.add(boxHelper);
    
    setHasSelection(true);
    updateUIForSelection();
  };

  const deselectPart = () => {
    const e = engine.current;
    if (e.selectionBoxes) e.selectionBoxes.forEach(box => e.scene.remove(box));
    e.selectionBoxes = [];
    e.selectedMeshes = [];
    setHasSelection(false);
  };

  const showLoading = (text) => {
    setLoadingText(text);
    setIsLoading(true);
  };
  const hideLoading = () => setIsLoading(false);

  // File Handlers
  const loadModelToScene = (url) => {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/'); 
    loader.setDRACOLoader(dracoLoader);
    
    loader.load(url, (gltf) => {
        const eng = engine.current;
        if(eng.currentModel) {
            eng.scene.remove(eng.currentModel);
            if (eng.transformControl) eng.transformControl.detach();
        }
        eng.currentModel = gltf.scene;
        eng.scene.add(eng.currentModel);
        
        eng.currentModel.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(eng.currentModel);
        const center = box.getCenter(new THREE.Vector3());
        eng.currentModel.position.set(-center.x, -box.min.y, -center.z);
        if (eng.transformControl) eng.transformControl.attach(eng.currentModel);
        
        hideLoading();
    }, undefined, (err) => {
        console.error(err);
        hideLoading();
        alert("Model yükleme hatası!");
    });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    
    if(!file.name.toLowerCase().endsWith('.glb')) {
        alert("Sadece .glb uzantılı modeller yüklenebilir.");
        e.target.value = "";
        return;
    }
    
    setPendingFile(file);
    showLoading("MODEL AÇILIYOR...");
    loadModelToScene(URL.createObjectURL(file));
    e.target.value = "";
  };

  const handleTexChange = (e) => {
    if(engine.current.selectedMeshes.length === 0 || !e.target.files[0]) return;
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
            engine.current.selectedMeshes.forEach(mesh => {
                mesh.material.map = tex; 
                mesh.material.needsUpdate = true;
            });
        };
    };
    reader.readAsDataURL(e.target.files[0]);
    e.target.value = "";
  };

  // Mesh Properties updaters
  const updateSelectedMeshColor = (hex, sat) => {
    const { selectedMeshes } = engine.current;
    if(selectedMeshes.length === 0) return;
    const color = new THREE.Color(hex);
    const hsl = {}; color.getHSL(hsl);
    color.setHSL(hsl.h, sat, hsl.l);
    selectedMeshes.forEach(mesh => {
        mesh.material.color.copy(color);
    });
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
      engine.current.selectedMeshes.forEach(mesh => {
          if(mesh.material.map) mesh.material.map.repeat.set(v, v);
      });
  };
  const handleTexRotate = (e) => {
      const v = parseFloat(e.target.value);
      setTexRotate(v);
      engine.current.selectedMeshes.forEach(mesh => {
          if(mesh.material.map) mesh.material.map.rotation = THREE.MathUtils.degToRad(v);
      });
  };
  const handleMeshOpacity = (e) => {
      const v = parseFloat(e.target.value);
      setMeshOpacity(v);
      engine.current.selectedMeshes.forEach(mesh => {
          mesh.material.transparent = v < 1; 
          mesh.material.opacity = v;
      });
  };
  const handleMeshMetal = (e) => {
      const v = parseFloat(e.target.value);
      setMeshMetal(v);
      engine.current.selectedMeshes.forEach(mesh => {
          mesh.material.metalness = v;
      });
  };
  const handleMeshRoughness = (e) => {
      const v = parseFloat(e.target.value);
      setMeshRoughness(v);
      engine.current.selectedMeshes.forEach(mesh => {
          mesh.material.roughness = v;
      });
  };
  const applyMetalPreset = () => {
      saveHistory('material');
      setMeshMetal(1);
      setMeshRoughness(0.15); // Low roughness = high gloss
      engine.current.selectedMeshes.forEach(mesh => {
          mesh.material.metalness = 1;
          mesh.material.roughness = 0.15;
          mesh.material.needsUpdate = true;
      });
  };
  const handleDeleteMesh = () => {
      saveHistory('delete');
      engine.current.selectedMeshes.forEach(mesh => mesh.removeFromParent());
      deselectPart();
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


  // Transformations
  const rotateModel = () => { 
      saveHistory('transform', engine.current.currentModel);
      if(engine.current.currentModel) engine.current.currentModel.rotation.y += Math.PI / 2; 
  };
  const centerAndSnapToFloor = () => { 
      saveHistory('transform', engine.current.currentModel);
      const model = engine.current.currentModel;
      if(model) { 
          model.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(model); 
          const center = box.getCenter(new THREE.Vector3());
          model.position.x -= center.x;
          model.position.z -= center.z;
          model.position.y -= box.min.y; 
      } 
  };
  const scaleCM = () => { 
      saveHistory('transform', engine.current.currentModel);
      if(engine.current.currentModel) engine.current.currentModel.scale.multiplyScalar(0.01); 
  };
  const scaleMM = () => { 
      saveHistory('transform', engine.current.currentModel);
      if(engine.current.currentModel) engine.current.currentModel.scale.multiplyScalar(0.001); 
  };
  const scaleUp = () => {
      saveHistory('transform', engine.current.currentModel);
      if(engine.current.currentModel) engine.current.currentModel.scale.multiplyScalar(100); 
  };

  const autoFitAndCenter = () => {
      saveHistory('transform', engine.current.currentModel);
      const model = engine.current.currentModel;
      if (!model) return;
      
      model.updateMatrixWorld(true);
      let box = new THREE.Box3().setFromObject(model);
      let size = new THREE.Vector3();
      box.getSize(size);
      
      const maxDim = Math.max(size.x, size.y, size.z);
      
      // Otomatik ölçek tahmini (Oyun grupları genelde 2-15 metre arasıdır)
      if (maxDim < 0.5) {
          model.scale.multiplyScalar(100); // Hatalı küçülmüş (FBXLoader 0.01 uygulamış olabilir), 100x büyüt
      } else if (maxDim > 500) {
          model.scale.multiplyScalar(0.001); // MM'den Metreye
      } else if (maxDim > 15) {
          model.scale.multiplyScalar(0.01); // CM'den Metreye
      }
      
      // Ölçekten sonra merkeze ve zemine tekrar hizala
      centerAndSnapToFloor();
  };

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
        
        // Otomatik merkezleme ve zemine oturtma (AR garantisi)
        const box = new THREE.Box3().setFromObject(e.currentModel);
        const center = box.getCenter(new THREE.Vector3());
        e.currentModel.position.x -= center.x;
        e.currentModel.position.z -= center.z;
        e.currentModel.position.y -= box.min.y;
        e.currentModel.updateMatrixWorld(true);

        e.currentModel.traverse(child => { if(child.isMesh) child.updateMatrixWorld(true); });

        e.grid.visible = false; 
        e.selectionBoxes.forEach(box => { box.visible = false; });
        if (e.transformControl) e.transformControl.visible = false;
        e.renderer.render(e.scene, e.camera);
        const thumbBlob = await fetch(e.renderer.domElement.toDataURL("image/webp", 0.8)).then(r => r.blob());
        e.grid.visible = true;
        e.selectionBoxes.forEach(box => { box.visible = true; });
        if (e.transformControl) e.transformControl.visible = true;

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

            setLoadingText("DOSYALAR BULUTA YÜKLENİYOR...");
            const { error: tErr } = await supabase.storage.from('models').upload(`${name}-thumb.webp`, thumbBlob, { upsert: true });
            if (tErr) throw new Error("Görsel yüklenemedi: " + tErr.message);
            
            const glbBlob = new Blob([buffer], { type: 'model/gltf-binary' });
            const { error: gErr } = await supabase.storage.from('models').upload(`${name}-3d.glb`, glbBlob, { upsert: true });
            if (gErr) throw new Error("Model dosyası yüklenemedi (Dosya boyutu çok büyük olabilir): " + gErr.message);

            const { error: iosErr } = await supabase.storage.from('models').upload(`${name}-3d-ios.glb`, glbBlob, { upsert: true });
            if (iosErr) console.error('iOS GLB upload hatası:', iosErr);

            if(variations.length > 0) {
                const vBlob = new Blob([JSON.stringify(variations)], { type: "application/json" });
                await supabase.storage.from('models').upload(`${name}-vars.json`, vBlob, { upsert: true });
            }

            const { error: dbErr } = await supabase.from('models').upsert([{ 
                user_id: user.id, 
                name: name, 
                serial_code: serial, 
                exposure: e.renderer.toneMappingExposure,
                created_at: new Date().toISOString()
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
        {/* Save Modal */}
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
            <button className="editor-btn" style={{ width: 'auto' }} onClick={() => fileInputRef.current?.click()}>📂 GLB Model Aç</button>
            <button className="editor-btn primary" style={{ width: 'auto', marginLeft: '8px' }} onClick={openSaveModal}>☁️ Kütüphaneye Kaydet</button>
        </div>

        <div className="editor-workspace">
            <div className="editor-sidebar">
                <div className="editor-panel">
                    <span className="editor-label">Kutu Seçim Modu</span>
                    <button 
                        className={`editor-btn ${isBoxSelectMode ? 'primary' : ''}`} 
                        onClick={() => {
                            const newState = !isBoxSelectMode;
                            setIsBoxSelectMode(newState);
                            document.body.setAttribute('data-box-select', newState.toString());
                        }}
                    >
                        {isBoxSelectMode ? '🟩 Kutu Çizimi Aktif' : '🖱️ Serbest Kamera (Orbit)'}
                    </button>
                    <div style={{ fontSize: '10px', color: '#888', marginTop: '6px' }}>Kısayol: Farenizle SHIFT'e basılı tutarak kutu çizebilirsiniz. Geri almak için Ctrl+Z yapın.</div>
                </div>

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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span className="editor-label" style={{ marginBottom: 0 }}>Sık Kullanılan Renkler</span>
                        <span style={{ fontSize: '9px', color: '#888' }}>Çift Tıkla: Düzenle</span>
                    </div>
                    <div className="palette-grid">
                        {paletteColors.map((col, i) => (
                            <div 
                                key={i} 
                                className="palette-color-box"
                                style={{ backgroundColor: col }}
                                onClick={() => handlePaletteClick(col)}
                                onDoubleClick={() => triggerColorEdit(i)}
                                title="Sol tık: Seçili parçaya uygula | Çift tık: Rengi Değiştir"
                            ></div>
                        ))}
                    </div>
                    <input type="color" ref={paletteInputRef} style={{ visibility: 'hidden', position: 'absolute', width: 0, height: 0 }} onChange={handlePaletteColorChange} />
                </div>

                <div className="editor-panel">
                    <span className="editor-label">Ölçek ve Yönlendirme</span>
                    
                    <button className="editor-btn primary" style={{ marginBottom: '10px' }} onClick={autoFitAndCenter}>
                        🪄 Otomatik Boyutlandır & Gride Oturt
                    </button>

                    <div style={{ display: 'flex', gap: '5px', marginBottom: '8px' }}>
                        <button className="editor-btn" onClick={scaleCM} title="100 kat küçültür">CM ➔ M</button>
                        <button className="editor-btn" onClick={scaleMM} title="1000 kat küçültür">MM ➔ M</button>
                        <button className="editor-btn" onClick={scaleUp} title="100 kat büyütür">100x Büyüt</button>
                    </div>
                    <button className="editor-btn" onClick={rotateModel}>🔄 90° Çevir</button>
                    <button className="editor-btn" style={{ marginTop: '6px' }} onClick={centerAndSnapToFloor}>⬇️ Merkeze ve Zemine Hizala</button>
                </div>
                
                {hasSelection && (
                    <div className="editor-panel" onPointerDown={() => saveHistory('material')}>
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

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                            <span className="editor-label" style={{ marginTop: 0 }}>Metalik Özellikler</span>
                            <button className="editor-btn" style={{ width: 'auto', padding: '2px 8px', fontSize: '11px', marginBottom: '8px' }} onClick={applyMetalPreset}>✨ Tam Metal Yap</button>
                        </div>
                        
                        <span className="editor-label" style={{ fontSize: '11px', color: '#888' }}>Metalik Yansıma Miktarı</span>
                        <input type="range" min="0" max="1" step="0.05" value={meshMetal} onChange={handleMeshMetal} />

                        <span className="editor-label" style={{ fontSize: '11px', color: '#888' }}>Pürüzsüzlük (Parlaklık)</span>
                        <input type="range" min="0" max="1" step="0.05" value={1 - meshRoughness} onChange={(e) => {
                            const v = 1 - parseFloat(e.target.value); // ters mantık: 1 = çok parlak (roughness 0)
                            handleMeshRoughness({ target: { value: v } });
                        }} />
                        
                        <button className="editor-btn" style={{ borderColor: '#ef4444', color: '#ef4444', marginTop: '15px', background: 'rgba(239,68,68,0.05)' }} onClick={handleDeleteMesh}>🗑️ Parçayı Sil</button>
                    </div>
                )}

                <div className="editor-panel">
                    <span className="editor-label">Sahne Işığı ve HDR</span>
                    <span className="editor-label">Exposure (Pozlama)</span>
                    <input type="range" min="0.1" max="4" step="0.1" value={exposure} onChange={handleExposure} />
                    <span className="editor-label">Güneş Açısı</span>
                    <input type="range" min="0" max="360" step="1" value={sunAngle} onChange={handleSunAngle} />
                    

                </div>
            </div>
            
            <div className="editor-viewport" ref={containerRef} tabIndex="0">
                <div ref={selectionDivRef} className="selectBox"></div>
                <div className={`editor-loading-ov ${isLoading ? 'open' : ''}`}>
                    <div className="editor-spinner"></div>
                    <div style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '18px', marginTop: '15px', textAlign: 'center' }}>
                        {loadingText}
                    </div>
                    {isLoading && (
                        <div style={{ color: '#aaa', fontSize: '13px', marginTop: '12px', maxWidth: '350px', textAlign: 'center', lineHeight: '1.5' }}>
                            <span style={{color: '#fff', fontWeight: 'bold'}}>Draco Motoru Aktif:</span> Bu işlem 3D objenizi sıkıştırıp optimize etmeye yarar. (Apple AR ve web uyumluluğu için gereklidir).
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
}
