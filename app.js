import * as THREE from './libs/three/three.module.js';
import { GLTFLoader } from './libs/three/jsm/GLTFLoader.js';
import { DRACOLoader } from './libs/three/jsm/DRACOLoader.js';
import { RGBELoader } from './libs/three/jsm/RGBELoader.js';
import { Stats } from './libs/stats.module.js';
import { LoadingBar } from './libs/LoadingBar.js';
import { VRButton } from './libs/VRButton.js';
import { CanvasUI } from './libs/CanvasUI.js';
import { GazeController } from './libs/GazeController.js';
import { XRControllerModelFactory } from './libs/three/jsm/XRControllerModelFactory.js';

class App {
    constructor() {
        const container = document.createElement('div');
        document.body.appendChild(container);

        this.assetsPath = './assets/';

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 500);
        this.camera.position.set(0, 1.6, 0);

        this.dolly = new THREE.Object3D();
        this.dolly.position.set(0, 0, 10);
        this.dolly.add(this.camera);
        this.dummyCam = new THREE.Object3D();
        this.camera.add(this.dummyCam);

        this.scene = new THREE.Scene();
        this.scene.add(this.dolly);

        const ambient = new THREE.HemisphereLight(0xFFFFFF, 0xAAAAAA, 0.8);
        this.scene.add(ambient);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        container.appendChild(this.renderer.domElement);

        this.setEnvironment();

        window.addEventListener('resize', this.resize.bind(this));

        this.clock = new THREE.Clock();
        this.up = new THREE.Vector3(0, 1, 0);
        this.origin = new THREE.Vector3();
        this.workingVec3 = new THREE.Vector3();
        this.workingQuaternion = new THREE.Quaternion();
        this.raycaster = new THREE.Raycaster();

        this.stats = new Stats();
        container.appendChild(this.stats.dom);

        this.loadingBar = new LoadingBar();
        this.immersive = false;
        this.moveSpeed = 2;

        this.loadSavedPosition();
        this.loadCollege();

        fetch('./college.json')
            .then(response => response.json())
            .then(obj => {
                this.boardShown = '';
                this.boardData = obj;
            });

        this.createMiniMap();
    }

    createMiniMap() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        canvas.style.position = 'absolute';
        canvas.style.bottom = '10px';
        canvas.style.right = '10px';
        canvas.style.border = '2px solid white';
        canvas.style.background = 'rgba(0,0,0,0.4)';
        document.body.appendChild(canvas);
        this.miniMapCtx = canvas.getContext('2d');
    }

    updateMiniMap() {
        const ctx = this.miniMapCtx;
        if (!ctx || !this.proxy) return;
        const dollyPos = this.dolly.position;
        ctx.clearRect(0, 0, 256, 256);
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(dollyPos.x * 5 + 128, 256 - dollyPos.z * 5, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    savePosition() {
        const pos = this.dolly.position;
        localStorage.setItem('vr_position', JSON.stringify({ x: pos.x, y: pos.y, z: pos.z }));
    }

    loadSavedPosition() {
        const saved = localStorage.getItem('vr_position');
        if (saved) {
            try {
                const pos = JSON.parse(saved);
                this.dolly.position.set(pos.x, pos.y, pos.z);
            } catch (e) {
                console.warn('Failed to parse saved position');
            }
        }
    }

    // ... (keep all other existing methods unchanged)

    render(timestamp, frame) {
        const dt = this.clock.getDelta();
        if (this.renderer.xr.isPresenting) {
            let moveGaze = false;

            if (this.useGaze && this.gazeController !== undefined) {
                this.gazeController.update();
                moveGaze = (this.gazeController.mode == GazeController.Modes.MOVE);
            }

            if (this.selectPressed || moveGaze) {
                this.moveDolly(dt);
                this.savePosition();
                if (this.boardData) {
                    const scene = this.scene;
                    const dollyPos = this.dolly.getWorldPosition(new THREE.Vector3());
                    let boardFound = false;
                    Object.entries(this.boardData).forEach(([name, info]) => {
                        const obj = scene.getObjectByName(name);
                        if (obj !== undefined) {
                            const pos = obj.getWorldPosition(new THREE.Vector3());
                            if (dollyPos.distanceTo(pos) < 3) {
                                boardFound = true;
                                if (this.boardShown !== name) this.showInfoboard(name, info, pos);
                            }
                        }
                    });
                    if (!boardFound) {
                        this.boardShown = "";
                        this.ui.visible = false;
                    }
                }
            }
        }

        this.updateMiniMap();

        if (this.immersive != this.renderer.xr.isPresenting) {
            this.resize();
            this.immersive = this.renderer.xr.isPresenting;
        }

        this.stats.update();
        this.renderer.render(this.scene, this.camera);
    }
}

export { App };
