import * as THREE from 'three';
import { createLetterPlayground } from './letter-playground.js?v=52';
import { mountPalettePicker } from './scene-palettes.js?v=46';
import URDFLoader from './vendor/urdf-loader.js';
import { STLLoader } from './vendor/stl-loader.js';

const host = document.querySelector('.robot-companion');
if (host) mountRobot(host).catch((error) => {
  host.remove();
  console.warn('SO-101 companion unavailable:', error.message);
});

async function mountRobot(container) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0xffffff, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  // LeHome top_camera: right-base-relative ROS pose, converted to Three's -Z camera.
  const camera = new THREE.OrthographicCamera(-1, 1, 0.3, -0.3, 0.01, 10);
  camera.position.set(-0.015, 0.19, 0.56);
  camera.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI)
    .multiply(new THREE.Quaternion(-0.9862856, 0, 0, 0.1650476).normalize())
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
  camera.rotateX(0.28);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8c8c8c, 0.9));
  const light = new THREE.PointLight(0xffffff, 7, 0, 2);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, { near: 0.05, far: 12 });
  light.shadow.bias = -0.0005;
  light.shadow.normalBias = 0.001;
  light.shadow.radius = 9;
  scene.add(light);
  const shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.12, color: 0x000000 });
  // Fade the receiver near the viewport edge instead of cutting a shadow off abruptly.
  shadowMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec2 viewportSize;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\nvec2 edge = min(gl_FragCoord.xy, viewportSize - gl_FragCoord.xy);\ngl_FragColor.a *= smoothstep(0.0, 32.0, min(edge.x, edge.y));');
    shader.uniforms.viewportSize = { value: new THREE.Vector2() };
    shadowMaterial.userData.shader = shader;
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), shadowMaterial);
  ground.position.z = -0.006;
  ground.receiveShadow = true;
  scene.add(ground);

  const manager = new THREE.LoadingManager();
  const loader = new URDFLoader(manager);
  loader.parseCollision = false;
  const meshes = new Map();
  const stl = new STLLoader();
  if ('DecompressionStream' in window) loader.loadMeshCb = (url, loadingManager, done) => {
    loadingManager.itemStart(url);
    if (!meshes.has(url)) meshes.set(url, fetch(url + '.gz')
      .then(response => {
        if (!response.ok) throw new Error('Compressed mesh unavailable');
        return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      })
      .catch(() => fetch(url).then(response => {
        if (!response.ok) throw new Error('Mesh unavailable');
        return response.arrayBuffer();
      }))
      .then(buffer => stl.parse(buffer)));
    meshes.get(url).then(geometry => done(new THREE.Mesh(geometry)))
      .catch(error => { done(null, error); loadingManager.itemError(url); })
      .finally(() => loadingManager.itemEnd(url));
  };
  const modelURL = new URL('../models/so101/so101.urdf', import.meta.url).href;
  let robot;
  await new Promise((resolve, reject) => {
    manager.onLoad = resolve;
    manager.onError = (url) => reject(new Error(`Could not load ${url}`));
    loader.load(modelURL, (model) => { robot = model; }, undefined, reject);
  });
  if (!robot) throw new Error('SO-101 model is missing');
  meshes.clear();
  const materials = new Map();
  robot.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      const original = object.material;
      const key = original.color.getHex();
      if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({
        color: 0x92969a,
        roughness: 0.42, metalness: 0.32,
      }));
      object.material = materials.get(key);
      original.dispose();
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.78, toneMapped: false });
      const edgeLines = new THREE.LineSegments(new THREE.EdgesGeometry(object.geometry, 32), edgeMaterial);
      edgeLines.name = 'soft-white-edge';
      edgeLines.renderOrder = 2;
      object.add(edgeLines);
    }
  });
  // The challenge USD uses a different base frame from the original SO-101 URDF.
  robot.rotation.z = -Math.PI / 2;
  robot.position.set(0.0207909, 0.0157608, 0.0324817);
  const wristJoint = robot.joints.wrist_roll;
  wristJoint.quaternion.set(0.00000092949, 0.7071081, 0.7071055, 0.00000086315).normalize();
  wristJoint.origQuaternion = wristJoint.quaternion.clone();
  // Identical ready poses make the parallel, fixed bases readable before interaction.
  const workingPoses = [
    [0, -0.8, 1.4, 1.4, 0, 0.15],
    [0, -0.8, 1.4, 1.4, 0, 0.15],
  ];
  const jointNames = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'];
  // Calibrated in the URDF frame: the extended chain points along world +Z.
  const uprightPose = { shoulder_lift: -0.22, elbow_flex: -1.28, wrist_flex: -0.16 };
  const trackingPose = { shoulder_lift: 0.45, elbow_flex: -0.65, wrist_flex: 1.05 };
  const arms = [robot, robot.clone()].map((model, index) => {
    const base = new THREE.Group();
    base.rotation.z = Math.PI;
    base.scale.setScalar(1.40);
    base.position.set(index === 0 ? -0.49 : 0.49, -0.25, 0);
    base.add(model);
    scene.add(base);
    const pose = Object.fromEntries(jointNames.map((name, joint) => [name, workingPoses[index][joint]]));
    model.setJointValues(pose);
    return { model, base, side: index === 0 ? 'right' : 'left', rest: pose, current: { ...pose }, desired: { ...pose } };
  });
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const framing = new THREE.Box3();
  const corner = new THREE.Vector3();
  for (const pose of [{}, trackingPose, uprightPose]) {
  for (const arm of arms) arm.model.setJointValues({ ...arm.rest, ...pose });
  scene.updateMatrixWorld(true);
  for (const arm of arms) arm.model.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          corner.set(x, y, z).applyMatrix4(object.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
          framing.expandByPoint(corner);
        }
      }
    }
  });
  }
  for (const arm of arms) arm.model.setJointValues(arm.rest);
  scene.updateMatrixWorld(true);
  const restCorners = [];
  for (const arm of arms) arm.model.traverse(object => {
    if (!object.isMesh) return;
    const box = object.geometry.boundingBox;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      restCorners.push(new THREE.Vector3(x, y, z).applyMatrix4(object.matrixWorld));
    }
  });
  const frameCenter = framing.getCenter(new THREE.Vector3());
  const frameSize = framing.getSize(new THREE.Vector3());
  camera.translateX(frameCenter.x);
  camera.translateY(frameCenter.y);
  const cameraCenter = camera.position.clone();
  const cameraOrientation = camera.quaternion.clone();
  const screenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const cameraNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(cameraOrientation);
  const groundDistance = (cameraCenter.z - 0.015) / cameraNormal.z;
  const viewCenter = cameraCenter.clone().addScaledVector(cameraNormal, -groundDistance);
  const hero = document.querySelector('.home-hero');
  const avatar = document.querySelector('.profile-avatar');
  const lightRay = new THREE.Raycaster();
  let lightPointer = null;
  function updateLight() {
    if (!avatar) return;
    const rect = avatar.getBoundingClientRect();
    const viewport = container.getBoundingClientRect();
    const x = lightPointer?.x ?? rect.left + rect.width / 2;
    const y = lightPointer?.y ?? rect.top + rect.height / 2;
    lightRay.setFromCamera(new THREE.Vector2(
      ((x - viewport.left) / viewport.width) * 2 - 1,
      1 - ((y - viewport.top) / viewport.height) * 2,
    ), camera);
    // Keep the elevated light directly under the pointer in screen space.
    const distance = (1.5 - lightRay.ray.origin.z) / lightRay.ray.direction.z;
    light.position.copy(lightRay.ray.origin).addScaledVector(lightRay.ray.direction, distance);
  }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = true;
  let frame = 0;
  let lastTime = 0;
  let playground;
  let activeUntil = 0;
  let idleWake = 0;
  const armSways = arms.map(() => ({ angle: 0, velocity: 0 }));
  let lastEdge = -Infinity;
  let edgeStrength = 0;
  let lastWheelTime = 0;
  function swingAtEdge(direction, speed) {
    const now = performance.now();
    if (reducedMotion.matches || !visible || hero.classList.contains('is-dragging')) return;
    const strength = 0.08 + 0.72 * Math.sqrt(Math.min(speed / 3000, 1));
    let impulse = strength;
    if (now - lastEdge < 850) {
      if (strength <= edgeStrength) return;
      impulse = strength - edgeStrength;
    } else {
      lastEdge = now;
    }
    edgeStrength = strength;
    armSways.forEach((sway, index) => {
      if (!playground?.armBusy(index)) sway.velocity += direction * impulse * (index === 0 ? 1 : 0.78);
    });
    playground?.applyInertia(direction, impulse);
    wake();
  }
  function animate(now) {
    frame = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min((now - lastTime) / 1000 || 1 / 60, 0.05);
    lastTime = now;
    let jointsMoving = false;
    for (const arm of arms) {
      for (const name of Object.keys(arm.current)) {
        if (Math.abs(arm.desired[name] - arm.current[name]) > 0.0005) jointsMoving = true;
        arm.current[name] += (arm.desired[name] - arm.current[name]) * (1 - Math.exp(-7 * dt));
      }
      arm.model.setJointValues(arm.current);
    }
    scene.updateMatrixWorld(true);
    const moving = playground?.update(now, dt);
    // Bend only upper joints; fixed bases and the camera never move.
    armSways.forEach((sway, index) => {
      const step = Math.min(dt, 1 / 30);
      sway.velocity += (-(index === 0 ? 80 : 95) * sway.angle - 9 * sway.velocity) * step;
      sway.angle = THREE.MathUtils.clamp(sway.angle + sway.velocity * step, -0.065, 0.065);
      if (reducedMotion.matches || playground?.armBusy(index) || Math.abs(sway.angle) + Math.abs(sway.velocity) < 0.0004) sway.angle = sway.velocity = 0;
      const arm = arms[index];
      arm.model.setJointValues({ shoulder_lift: arm.current.shoulder_lift + sway.angle, elbow_flex: arm.current.elbow_flex - sway.angle * 0.65, wrist_flex: arm.current.wrist_flex + sway.angle * 0.3 });
    });
    if (shadowMaterial.userData.shader) renderer.getDrawingBufferSize(shadowMaterial.userData.shader.uniforms.viewportSize.value);
    renderer.render(scene, camera);
    for (const arm of arms) arm.model.setJointValues(arm.current);
    scene.updateMatrixWorld(true);
    container.dataset.renderCount = String(renderer.info.render.frame);
    if (moving || jointsMoving || armSways.some(sway => sway.angle !== 0 || sway.velocity !== 0) || now < activeUntil) frame = requestAnimationFrame(animate);
    else if (playground?.nextWake() !== null) {
      idleWake = setTimeout(wake, Math.max(100, playground.nextWake() - performance.now()));
    }
  }
  function wake() {
    clearTimeout(idleWake);
    activeUntil = performance.now() + 500;
    if (!frame && visible && !document.hidden) {
      lastTime = performance.now();
      frame = requestAnimationFrame(animate);
    }
  }
  function resize() {
    const vertical = window.matchMedia('(min-width: 761px)').matches;
    const anchor = hero.getBoundingClientRect();
    const anchorWidth = anchor.width;
    const anchorHeight = vertical ? anchor.height : 340;
    const aspect = anchorWidth / anchorHeight;
    const compact = anchorWidth < 600;
    const span = vertical ? anchorHeight : anchorWidth;
    const pixelsPerMeter = Math.min(560 / (frameSize.y * 1.04), span / (frameSize.x * 1.08));
    camera.top = anchorHeight / (2 * pixelsPerMeter);
    camera.quaternion.copy(cameraOrientation);
    camera.position.copy(cameraCenter);
    if (vertical) {
      // Change viewing azimuth instead of rolling gravity sideways on screen.
      const right = new THREE.Vector3(0, -1, 0).applyQuaternion(cameraOrientation);
      right.z = 0;
      right.normalize();
      const groundUp = new THREE.Vector3(0, 0, 1).cross(right).normalize();
      const up = groundUp.clone();
      // Reveal the right-hand extrusion without rolling the word or the tabletop.
      const tilt = THREE.MathUtils.degToRad(8);
      right.multiplyScalar(Math.cos(tilt)).addScaledVector(new THREE.Vector3(0, 0, 1), -Math.sin(tilt));
      const normal = right.clone().cross(up).normalize();
      camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
      camera.position.copy(viewCenter).addScaledVector(normal, groundDistance);
    } else {
      camera.position.addScaledVector(screenUp, ((compact ? 135 : 160) - anchorHeight / 2) / pixelsPerMeter);
    }
    camera.bottom = -camera.top;
    camera.right = camera.top * aspect;
    camera.left = -camera.right;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    if (vertical && playground) {
      const bounds = playground.homeBounds;
      const wordCorners = [];
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            wordCorners.push(new THREE.Vector3(x, y, z));
          }
        }
      }
      // Fit the complete resting scene, independent of the current animated pose.
      const projected = new THREE.Box3().setFromPoints([...restCorners, ...wordCorners]
        .map(point => point.clone().applyMatrix4(camera.matrixWorldInverse)));
      const size = projected.getSize(new THREE.Vector3());
      const center = projected.getCenter(new THREE.Vector3());
      const scale = Math.min((anchorWidth - 16) / size.x, (anchorHeight - 24) / size.y);
      camera.top = anchorHeight / (2 * scale);
      camera.bottom = -camera.top;
      camera.right = camera.top * aspect;
      camera.left = -camera.right;
      camera.translateX(center.x);
      camera.translateY(center.y);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
    }
    // Keep the sidebar composition, but render beyond it across the entire page.
    const unitsPerPixel = (camera.right - camera.left) / anchorWidth;
    camera.left -= anchor.left * unitsPerPixel;
    camera.right = camera.left + container.clientWidth * unitsPerPixel;
    camera.top += anchor.top * unitsPerPixel;
    camera.bottom = camera.top - container.clientHeight * unitsPerPixel;
    camera.updateProjectionMatrix();
    updateLight();
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    wake();
  }
  playground = await createLetterPlayground({ scene, camera, container, arms, wake, reducedMotion });
  mountPalettePicker(palette => {
    for (const material of materials.values()) {
      material.color.set(palette.robot);
      material.metalness = palette.metalness;
      material.roughness = palette.roughness;
    }
    for (const arm of arms) arm.model.traverse(object => {
      if (object.name === 'soft-white-edge') object.material.color.set(palette.edge);
    });
    playground.setPalette(palette);
    document.body.style.setProperty('--accent', palette.accent);
    document.body.dataset.palette = palette.id;
    wake();
  });
  resize();
  new ResizeObserver(resize).observe(container);
  new ResizeObserver(resize).observe(hero);
  window.addEventListener('scroll', resize, { passive: true });
  function followPointer(event) {
    lightPointer = { x: event.clientX, y: event.clientY };
    updateLight();
    wake();
  }
  document.addEventListener('pointermove', followPointer, { passive: true });
  document.addEventListener('pointerdown', followPointer, { passive: true });
  const content = document.querySelector('.homepage-content');
  const scrollOffsets = new WeakMap();
  for (const element of [content, document.scrollingElement]) scrollOffsets.set(element, { top: element.scrollTop, time: performance.now() });
  document.addEventListener('scroll', event => {
    const element = event.target === document ? document.scrollingElement : event.target;
    if (element !== content && element !== document.scrollingElement) return;
    const now = performance.now();
    const previous = scrollOffsets.get(element) ?? { top: element.scrollTop, time: now };
    const delta = element.scrollTop - previous.top;
    const speed = Math.abs(delta) / THREE.MathUtils.clamp((now - previous.time) / 1000, 0.016, 0.12);
    scrollOffsets.set(element, { top: element.scrollTop, time: now });
    const end = element.scrollHeight - element.clientHeight;
    if (end <= 1) return;
    if (delta < 0 && element.scrollTop <= 1) swingAtEdge(-1, speed);
    if (delta > 0 && element.scrollTop >= end - 1) swingAtEdge(1, speed);
  }, { capture: true, passive: true });
  document.addEventListener('wheel', event => {
    const now = performance.now();
    const elapsed = THREE.MathUtils.clamp((now - lastWheelTime) / 1000, 0.016, 0.12);
    lastWheelTime = now;
    const element = matchMedia('(min-width: 761px)').matches ? content : document.scrollingElement;
    const pixels = Math.abs(event.deltaY) * (event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? element.clientHeight : 1);
    const speed = pixels / elapsed;
    const end = element.scrollHeight - element.clientHeight;
    if (end <= 1) return;
    if (event.deltaY < 0 && element.scrollTop <= 1) swingAtEdge(-1, speed);
    if (event.deltaY > 0 && element.scrollTop >= end - 1) swingAtEdge(1, speed);
  }, { passive: true });
  document.querySelector('.homepage-content').addEventListener('scroll', () => { updateLight(); wake(); }, { passive: true });
  if (avatar) new ResizeObserver(() => { updateLight(); wake(); }).observe(avatar);
  document.fonts.ready.then(() => { updateLight(); wake(); });
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) wake();
    else { clearTimeout(idleWake); playground.suspend(); cancelAnimationFrame(frame); frame = 0; }
  }).observe(hero);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimeout(idleWake); playground.suspend(); cancelAnimationFrame(frame); frame = 0; }
    else wake();
  });
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    visible = false;
    playground.dispose();
    cancelAnimationFrame(frame);
    frame = 0;
    container.hidden = true;
    document.body.classList.remove('has-letter-playground');
  });
  container.dataset.model = 'so101-dual';
  wake();
}
