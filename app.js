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

        this.ambientLight = new THREE.HemisphereLight(0xfff1cc, 0x444444, 1.0);
        this.scene.add(this.ambientLight);

        this.directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        this.directionalLight.position.set(10, 10, 5);
        this.directionalLight.castShadow = true;
        this.scene.add(this.directionalLight);

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

        this.loadCollege();

        this.immersive = false;
        this.walkingSpeed = 2; // Custom walking speed

        const self = this;

        fetch('./college.json')
            .then(response => response.json())
            .then(obj => {
                self.boardShown = '';
                self.boardData = obj;
            });
    }

    setEnvironment() {
        const loader = new RGBELoader().setDataType(THREE.UnsignedByteType);
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();

        loader.load('./assets/hdr/venice_sunset_1k.hdr', (texture) => {
            const envMap = pmremGenerator.fromEquirectangular(texture).texture;
            pmremGenerator.dispose();
            this.scene.environment = envMap;
        }, undefined, (err) => {
            console.error('An error occurred setting the environment');
        });
    }
    toggleDayNight(isDay){
        this.scene.background = new THREE.Color(isDay ? 0x87CEEB : 0x0D1B2A);
        this.scene.fog = new THREE.Fog(this.scene.background, 5, 20);
        this.ambientLight.intensity = isDay ? 1.0 : 0.2;
        this.directionalLight.intensity = isDay ? 1.0 : 0.1;
    }
    resize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    loadCollege() {
        const loader = new GLTFLoader().setPath(this.assetsPath);
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('./libs/three/js/draco/');
        loader.setDRACOLoader(dracoLoader);

        const self = this;

        loader.load('college.glb', function (gltf) {
            const college = gltf.scene.children[0];
            self.scene.add(college);

            college.traverse(function (child) {
                if (child.isMesh) {
                    if (child.name.indexOf("PROXY") != -1) {
                        child.material.visible = false;
                        self.proxy = child;
                    } else if (child.material.name.indexOf('Glass') != -1) {
                        child.material.opacity = 0.1;
                        child.material.transparent = true;
                    } else if (child.material.name.indexOf("SkyBox") != -1) {
                        const mat1 = child.material;
                        const mat2 = new THREE.MeshBasicMaterial({ map: mat1.map });
                        child.material = mat2;
                        mat1.dispose();
                    }
                }
            });

            const door1 = college.getObjectByName("LobbyShop_Door__1_");
            const door2 = college.getObjectByName("LobbyShop_Door__2_");
            const pos = door1.position.clone().sub(door2.position).multiplyScalar(0.5).add(door2.position);
            const obj = new THREE.Object3D();
            obj.name = "LobbyShop";
            obj.position.copy(pos);
            college.add(obj);

            self.loadingBar.visible = false;

            self.setupXR();
        },
            function (xhr) {
                self.loadingBar.progress = (xhr.loaded / xhr.total);
            },
            function (error) {
                console.log('An error happened');
            }
        );
    }

    setupXR() {
        this.renderer.xr.enabled = true;
        new VRButton(this.renderer);

        const timeoutId = setTimeout(() => {
            this.useGaze = true;
            this.gazeController = new GazeController(this.scene, this.dummyCam);
        }, 2000);

        const controllers = this.buildControllers(this.dolly);
        controllers.forEach(controller => {
            controller.addEventListener('selectstart', () => controller.userData.selectPressed = true);
            controller.addEventListener('selectend', () => controller.userData.selectPressed = false);
            controller.addEventListener('connected', () => clearTimeout(timeoutId));
        });
        this.controllers = controllers;

        const config = {
            panelSize: { width: 1.2, height: 0.6 },
            height: 256,
            borderRadius: 12,
            padding: 30,
            backgroundColor: '#f9f9f9',
            name: { fontSize: 60, height: 80, fontColor: '#001f3f' },
            info: { position: { top: 80, backgroundColor: '#e2e2e2', fontColor: '#111' } }
        };

        const content = {
            name: "Welcome",
            info: "Information will appear here."
        };

        this.ui = new CanvasUI(content, config);
        this.scene.add(this.ui.mesh);

        this.renderer.setAnimationLoop(this.render.bind(this));
    }

    buildControllers(parent = this.scene) {
        const controllerModelFactory = new XRControllerModelFactory();
        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -1)
        ]);
        const line = new THREE.Line(geometry);
        line.scale.z = 0;

        return [0, 1].map(i => {
            const controller = this.renderer.xr.getController(i);
            controller.add(line.clone());
            controller.userData.selectPressed = false;
            parent.add(controller);

            const grip = this.renderer.xr.getControllerGrip(i);
            grip.add(controllerModelFactory.createControllerModel(grip));
            parent.add(grip);

            return controller;
        });
    }

    moveDolly(dt) {
        if (!this.proxy) return;
        const wallLimit = 1.3;
        const pos = this.dolly.position.clone();
        pos.y += 1;

        const dir = new THREE.Vector3();
        const quaternion = this.dolly.quaternion.clone();
        this.dolly.quaternion.copy(this.dummyCam.getWorldQuaternion(this.workingQuaternion));
        this.dolly.getWorldDirection(dir);
        dir.negate();
        this.raycaster.set(pos, dir);

        let blocked = false;
        let intersect = this.raycaster.intersectObject(this.proxy);
        if (intersect.length > 0 && intersect[0].distance < wallLimit) blocked = true;

        if (!blocked) {
            this.dolly.translateZ(-dt * this.walkingSpeed);
        }

        const directions = [
            new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, -1, 0)
        ];

        directions.forEach(dir => {
            dir.applyMatrix4(this.dolly.matrix);
            dir.normalize();
            pos.y += dir.y === -1 ? 1.5 : 0;
            this.raycaster.set(pos, dir);
            intersect = this.raycaster.intersectObject(this.proxy);
            if (intersect.length > 0 && intersect[0].distance < wallLimit) {
                if (dir.y === -1) this.dolly.position.copy(intersect[0].point);
                else this.dolly.translateX((dir.x > 0 ? 1 : -1) * (wallLimit - intersect[0].distance));
            }
        });

        this.dolly.quaternion.copy(quaternion);
    }

    get selectPressed() {
        return this.controllers?.some(c => c.userData.selectPressed);
    }

    showInfoboard(name, info, pos) {
        if (!this.ui) return;
        this.ui.position.copy(pos).add(this.workingVec3.set(0, 1.3, 0));
        const camPos = this.dummyCam.getWorldPosition(this.workingVec3);
        this.ui.updateElement('name', info.name);
        this.ui.updateElement('info', info.info);
        this.ui.update();
        this.ui.lookAt(camPos);
        this.ui.visible = true;
        this.boardShown = name;
    }

    render() {
        const dt = this.clock.getDelta();

        if (this.renderer.xr.isPresenting) {
            const moveGaze = this.useGaze && this.gazeController?.mode === GazeController.Modes.MOVE;
            if (this.selectPressed || moveGaze) {
                this.moveDolly(dt);
                if (this.boardData) {
                    const dollyPos = this.dolly.getWorldPosition(new THREE.Vector3());
                    let boardFound = false;
                    for (const [name, info] of Object.entries(this.boardData)) {
                        const obj = this.scene.getObjectByName(name);
                        if (obj) {
                            const pos = obj.getWorldPosition(new THREE.Vector3());
                            if (dollyPos.distanceTo(pos) < 3) {
                                boardFound = true;
                                if (this.boardShown !== name) this.showInfoboard(name, info, pos);
                            }
                        }
                    }
                    if (!boardFound) {
                        this.boardShown = "";
                        this.ui.visible = false;
                    }
                }
            }
        }

        if (this.immersive !== this.renderer.xr.isPresenting) {
            this.resize();
            this.immersive = this.renderer.xr.isPresenting;
        }

        this.stats.update();
        this.renderer.render(this.scene, this.camera);
    }
}

export { App };
