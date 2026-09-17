import * as THREE from 'three';
import * as CANNON from './vendor/cannon-es.js';
import { FontLoader } from './vendor/FontLoader.js';
import { createArmIK } from './robot-ik.js';
import { createGraspFrame } from './grasp-frame.js';
import { deferLetter, completeLetter, nextLetter } from './letter-retry.js';

export async function createLetterPlayground({ scene, camera, container, arms, wake, reducedMotion }) {
  const font = await new FontLoader().loadAsync(new URL('../fonts/playfair-display-bold.typeface.json', import.meta.url).href);
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, -9.81) });
  world.allowSleep = true;
  world.solver.iterations = 12;
  world.defaultContactMaterial.friction = 0.42;
  world.defaultContactMaterial.restitution = 0.04;
  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  world.addBody(floor);
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.024);
  const hitPoint = new THREE.Vector3();
  const hand = new THREE.Vector3();
  const target = new THREE.Vector3();
  const handRotation = new THREE.Quaternion();
  const graspPoint = new THREE.Vector3();
  const items = [];
  for (const arm of arms) arm.graspFrame = createGraspFrame(arm.model);
  const solvers = arms.map(createArmIK);
  const reachSolvers = arms.map(createArmIK);
  let drag = null;
  let job = null;
  const jobs = [null, null];
  let enabled = !reducedMotion.matches;
  let nextAction = Infinity;
  let nextAssignment = 0;
  let disposed = false;
  let hoverPointer = null;
  const hero = document.querySelector('.home-hero');
  const armBounds = arms.map(arm => new THREE.Box3().setFromObject(arm.model, true));
  const wordCenterY = armBounds.reduce((sum, bounds) => sum + (bounds.min.y + bounds.max.y) / 2, 0) / arms.length;

  for (const [index, letter] of [...'YIFAN'].entries()) {
    const geometry = new THREE.ExtrudeGeometry(font.generateShapes(letter, 0.115), {
      depth: 0.018, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003,
      bevelSegments: 5, steps: 1, curveSegments: 12,
    });
    geometry.computeBoundingBox();
    const heightScale = 1.3;
    geometry.scale(heightScale, heightScale, 1);
    geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.rotateZ(Math.PI);
    const mesh = new THREE.Mesh(geometry, [
      new THREE.MeshStandardMaterial({ color: 0x7e8388, roughness: 0.38, metalness: 0.32 }),
      new THREE.MeshStandardMaterial({ color: 0xe4e6e8, roughness: 0.3, metalness: 0.22 }),
    ]);
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 12),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, toneMapped: false }),
    );
    outline.raycast = () => {};
    mesh.add(outline);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const home = new THREE.Vector3((index - 2) * 0.091, 0.01, size.z / 2 + 0.001);
    const body = new CANNON.Body({ mass: 0.045, linearDamping: 0.55, angularDamping: 0.65,
      shape: new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)),
      position: new CANNON.Vec3(home.x, home.y, home.z), sleepSpeedLimit: 0.035, sleepTimeLimit: 0.4 });
    world.addBody(body);
    body.angularFactor.set(0, 0, 1);
    const item = { letter, mesh, body, home, size, heightScale, sway: 0, swayVelocity: 0 };
    mesh.userData.item = item;
    items.push(item);
  }
  const letters = items;
  const wordWidth = letters.reduce((sum, item) => sum + item.size.x, 0) + 0.014 * 4 + 0.015;
  let cursor = wordWidth / 2;
  for (const item of letters) {
    item.home.x = cursor - item.size.x / 2;
    item.home.y = wordCenterY;
    item.body.position.copy(item.home);
    cursor -= item.size.x + 0.014 + (item.letter === 'I' ? 0.015 : 0);
  }

  const pusher = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0, shape: new CANNON.Sphere(0.013), collisionFilterMask: 0 });
  world.addBody(pusher);
  const trailGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: 0xb79834, transparent: true, opacity: 0.28 }));
  trail.visible = false;
  scene.add(trail);

  function setRay(x, y) {
    const rect = container.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2), camera);
  }
  function settle(item) {
    const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().copy(item.body.quaternion), 'XYZ');
    item.body.quaternion.setFromEuler(0, 0, rotation.z);
    item.body.type = CANNON.Body.DYNAMIC;
    item.body.collisionFilterMask = -1;
    item.body.updateMassProperties();
    item.body.velocity.setZero();
    item.body.angularVelocity.setZero();
    item.body.wakeUp();
  }
  function cancelJob() {
    for (const task of jobs) if (task?.held) settle(task.item);
    jobs.fill(null);
    job = null;
    pusher.collisionFilterMask = 0;
    trail.visible = false;
    for (const arm of arms) Object.assign(arm.desired, arm.rest);
  }
  function dirty(item) {
    return Math.hypot(item.body.position.x - item.home.x, item.body.position.y - item.home.y) > 0.009 ||
      Math.abs(item.body.quaternion.z) > 0.08 || Math.abs(item.body.quaternion.x) + Math.abs(item.body.quaternion.y) > 0.1;
  }
  function graspSpec(item) {
    return {
      point: new THREE.Vector3(
        ['F', 'N'].includes(item.letter) ? item.size.x / 2 - 0.014 * item.heightScale : item.letter === 'A' ? -0.01975 * item.heightScale : item.letter === 'Y' ? -0.00104 * item.heightScale : 0,
        item.letter === 'Y' ? item.size.y * 0.28 : item.letter === 'F' ? 0.025 * item.heightScale : item.letter === 'A' ? -0.0101 * item.heightScale : 0, 0),
      width: { Y: 0.02815, I: 0.02792, F: 0.02769, A: 0.03071, N: 0.02674 }[item.letter] * item.heightScale,
    };
  }
  function gripperOpening(arm, width) {
    return THREE.MathUtils.clamp((width / arm.base.scale.x - 0.0158) / 0.074, 0, 1);
  }
  const jawClearance = 0.012;
  // Check the same open and closed tool frames used by the pickup and placement.
  function reachableArm(item, position, rotation = item.body.quaternion) {
    const spec = graspSpec(item);
    const q = new THREE.Quaternion().copy(rotation);
    const point = spec.point.clone().applyQuaternion(q).add(position);
    point.z = item.home.z;
    const yaw = 2 * Math.atan2(q.z, q.w) + (item.letter === 'A' ? -0.3 : 0);
    const order = position.x < 0 ? [0, 1] : [1, 0];
    for (const index of order) {
      const arm = arms[index];
      const previous = arm.graspFrame.position.x;
      arm.graspFrame.position.x = -spec.width / (2 * arm.base.scale.x);
      const solver = reachSolvers[index];
      solver(point, yaw);
      let valid = solver.reachable;
      if (valid) {
        solver(point.clone().setZ(0.095), yaw);
        valid = solver.reachable;
      }
      if (valid) {
        solver(spec.point.clone().add(item.home), item.letter === 'A' ? -0.3 : 0);
        valid = solver.reachable;
      }
      if (valid) {
        solver(spec.point.clone().add(item.home).setZ(0.095), item.letter === 'A' ? -0.3 : 0);
        valid = solver.reachable;
      }
      arm.graspFrame.position.x = -(spec.width + jawClearance) / (2 * arm.base.scale.x);
      if (valid) {
        solver(point, yaw);
        valid = solver.reachable;
      }
      if (valid) {
        solver(point.clone().setZ(0.085), yaw);
        valid = solver.reachable;
      }
      arm.graspFrame.position.x = previous;
      if (valid) return index;
    }
    return -1;
  }
  function constrainPlacement(item, requested) {
    const start = new THREE.Vector3().copy(item.body.position);
    if (reachableArm(item, requested) >= 0) return requested;
    let low = 0, high = 1;
    for (let iteration = 0; iteration < 7; iteration++) {
      const middle = (low + high) / 2;
      const candidate = start.clone().lerp(requested, middle);
      if (reachableArm(item, candidate) >= 0) low = middle;
      else high = middle;
    }
    return start.lerp(requested, low);
  }
  function startJob(item, push, now, index = item.body.position.x < 0 ? 0 : 1) {
    const arm = arms[index];
    // Use solid strokes, avoiding the open centers of Y, A and F.
    const {point: grip, width: strokeWidth} = graspSpec(item);
    arm.graspFrame.position.x = -strokeWidth / (2 * arm.base.scale.x);
    arm.graspFrame.getWorldPosition(hand);
    job = { item, arm, index, push, grip, strokeWidth, phase: 'approach', start: now, from: hand.clone(), held: false, offset: new THREE.Vector3(), relativeRotation: new THREE.Quaternion(), lastSolve: 0 };
    jobs[index] = job;
    arm.desired.gripper = push ? 0.05 : gripperOpening(arm, strokeWidth + jawClearance);
    trail.visible = true;
    const positions = trail.geometry.attributes.position;
    positions.setXYZ(0, item.body.position.x, item.body.position.y, 0.004);
    positions.setXYZ(1, item.home.x, item.home.y, 0.004);
    positions.needsUpdate = true;
  }
  function transition(phase, now) {
    job.phase = phase;
    job.start = now;
    job.arm.graspFrame.getWorldPosition(job.from);
  }
  document.addEventListener('pointermove', event => {
    if (disposed || drag || event.buttons || event.pointerType !== 'mouse' || reducedMotion.matches) {
      hoverPointer = null;
      return;
    }
    setRay(event.clientX, event.clientY);
    const point = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!point) return;
    const now = performance.now();
    const previous = hoverPointer;
    hoverPointer = { point: point.clone(), x: event.clientX, y: event.clientY, time: now };
    if (!previous || now - previous.time > 150 || event.target.closest('a, button')) return;
    const elapsed = Math.max((now - previous.time) / 1000, 0.008);
    const pixels = Math.hypot(event.clientX - previous.x, event.clientY - previous.y);
    if (pixels < 0.5) return;
    const speed = pixels / elapsed;
    const movement = point.clone().sub(previous.point).setZ(0);
    if (movement.lengthSq() < 1e-10) return;
    const direction = movement.clone().normalize();
    let affected = false;
    for (const item of items) {
      if (item.body.type !== CANNON.Body.DYNAMIC || jobs.some(task => task?.item === item)) continue;
      // Sweep the full pointer segment so a fast pass cannot skip a letter.
      const center = new THREE.Vector3().copy(item.body.position).setZ(point.z);
      const closest = new THREE.Line3(previous.point, point).closestPointToPoint(center, true, new THREE.Vector3());
      const offset = closest.sub(center).applyQuaternion(new THREE.Quaternion().copy(item.body.quaternion).invert());
      const proximity = Math.max(Math.abs(offset.x) / (item.size.x / 2 + 0.018), Math.abs(offset.y) / (item.size.y / 2 + 0.018));
      if (proximity >= 1) continue;
      const influence = 1 - proximity;
      if (speed > 260) {
        item.swayVelocity = THREE.MathUtils.clamp(item.swayVelocity + Math.sign(direction.y || direction.x) * influence * 0.7, -1, 1);
      } else {
        const displacement = new THREE.Vector3().copy(item.body.position).sub(item.home).setZ(0);
        if (displacement.length() > 0.065 && displacement.dot(direction) > 0) continue;
        const velocity = THREE.MathUtils.clamp(movement.length() / elapsed, 0.14, 0.24) * Math.sqrt(influence);
        item.body.wakeUp();
        item.quietTime = 0;
        item.body.applyImpulse(new CANNON.Vec3(direction.x * item.body.mass * velocity, direction.y * item.body.mass * velocity, 0));
        const planarSpeed = Math.hypot(item.body.velocity.x, item.body.velocity.y);
        if (planarSpeed > 0.24) {
          item.body.velocity.x *= 0.24 / planarSpeed;
          item.body.velocity.y *= 0.24 / planarSpeed;
        }
        nextAction = now + 1800;
      }
      affected = true;
    }
    if (affected) wake();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { hoverPointer = null; });
  window.addEventListener('resize', () => { hoverPointer = null; });
  document.addEventListener('scroll', () => {
    hoverPointer = null;
  }, { capture: true, passive: true });
  document.addEventListener('pointerdown', event => {
    hoverPointer = null;
    if (event.target.closest('a, button') || event.button !== 0) return;
    const rect = container.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    setRay(event.clientX, event.clientY);
    const hit = ray.intersectObjects(items.map(item => item.mesh))[0];
    if (!hit) return;
    event.preventDefault();
    cancelJob();
    const item = hit.object.userData.item;
    item.sway = item.swayVelocity = 0;
    ray.ray.intersectPlane(plane, hitPoint);
    drag = { item, id: event.pointerId, offset: new THREE.Vector3(item.body.position.x, item.body.position.y, 0).sub(hitPoint) };
    item.body.type = CANNON.Body.KINEMATIC;
    item.body.velocity.setZero();
    item.body.angularVelocity.setZero();
    hero.setPointerCapture(event.pointerId);
    hero.classList.add('is-dragging');
    wake();
  });
  hero.addEventListener('pointermove', event => {
    setRay(event.clientX, event.clientY);
    if (!drag) {
      hero.classList.toggle('over-letter', ray.intersectObjects(items.map(item => item.mesh)).length > 0);
      return;
    }
    if (event.pointerId !== drag.id || !ray.ray.intersectPlane(plane, hitPoint)) return;
    hitPoint.add(drag.offset);
    const allowed = constrainPlacement(drag.item, hitPoint);
    drag.item.body.position.set(allowed.x, allowed.y, drag.item.home.z + drag.item.size.z + 0.006);
    wake();
  });
  function release() {
    if (!drag) return;
    settle(drag.item);
    drag = null;
    hero.classList.remove('is-dragging');
    nextAction = performance.now() + 900;
    wake();
  }
  hero.addEventListener('pointerup', release);
  hero.addEventListener('pointercancel', release);
  hero.addEventListener('lostpointercapture', release);
  window.addEventListener('blur', () => { release(); cancelJob(); });
  reducedMotion.addEventListener('change', () => { enabled = !reducedMotion.matches; cancelJob(); wake(); });

  function update(now, dt) {
    if (disposed) return false;
    if (enabled && !reducedMotion.matches && !drag && now > nextAction && now > nextAssignment) {
      nextAssignment = now + 500;
      for (const [index, arm] of arms.entries()) {
        if (jobs[index]) continue;
        const candidates = items.filter(item => dirty(item) && !jobs.some(task => task?.item === item) && reachableArm(item, new THREE.Vector3().copy(item.body.position)) === index)
          .sort((a, b) => Math.abs(a.body.position.x - arm.base.position.x) - Math.abs(b.body.position.x - arm.base.position.x));
        const misplaced = nextLetter(candidates, now, jobs.some(Boolean));
        if (misplaced) startJob(misplaced, false, now, index);
      }
      if (!jobs.some(Boolean) && !items.some(dirty)) nextAction = Infinity;
    }
    for (const task of jobs) {
      if (!task) continue;
      job = task;
      const { item, arm, phase, push } = job;
      const age = (now - job.start) / 1000;
      // Follow the midpoint of the asymmetric SO-101 jaws during closing.
      const gap = (0.0158 + 0.074 * arm.current.gripper) * arm.base.scale.x;
      arm.graspFrame.position.x = -(job.held ? job.strokeWidth : gap) / (2 * arm.base.scale.x);
      arm.graspFrame.getWorldPosition(hand);
      arm.model.links.gripper_frame_link.getWorldQuaternion(handRotation);
      const pos = item.body.position;
      const itemRotation = new THREE.Quaternion().copy(item.body.quaternion);
      graspPoint.copy(job.grip).applyQuaternion(itemRotation).add(new THREE.Vector3(pos.x, pos.y, pos.z));
      let duration = 1;
      if (phase === 'approach') {
        target.set(push ? pos.x - item.size.x / 2 - 0.016 : graspPoint.x, push ? pos.y : graspPoint.y, 0.085);
        duration = 1.15;
      } else if (phase === 'descend') {
        target.copy(graspPoint);
        if (push) target.set(pos.x - item.size.x / 2 - 0.016, pos.y, item.home.z + 0.005);
        duration = 0.8;
      } else if (phase === 'close') {
        target.copy(graspPoint);
        duration = 0.4;
      } else if (phase === 'push') {
        target.copy(job.pushEnd);
        duration = 0.85;
      } else if (phase === 'lift') {
        target.copy(job.from); target.z = 0.095;
        duration = 0.7;
      } else if (phase === 'carry') {
        target.copy(item.home).add(job.grip); target.z = 0.095;
        duration = 1.05;
      } else if (phase === 'place') {
        target.copy(item.home).add(job.grip);
        duration = 0.85;
      } else {
        target.copy(job.from); target.z = 0.095;
        duration = 0.6;
      }
      const t = THREE.MathUtils.smoothstep(age / duration, 0, 1);
      const destination = target.clone();
      container.dataset.reach = JSON.stringify({phase, letter: item.letter, down: new THREE.Vector3(0, 0, 1).applyQuaternion(handRotation).z, hand: hand.toArray(), target: destination.toArray(), error: hand.distanceTo(destination)});
      target.lerpVectors(job.from, destination, t);
      if (now > job.lastSolve + 60) {
        const placing = ['carry', 'place', 'retreat'].includes(phase);
        const yaw = placing ? (job.placementYaw ?? 0) : 2 * Math.atan2(item.body.quaternion.z, item.body.quaternion.w) + (item.letter === 'A' ? -0.3 : 0);
        Object.assign(arm.desired, solvers[job.index](target, yaw));
        job.lastSolve = now;
      }
      if (job.held) {
        item.body.collisionFilterMask = phase === 'place' ? -1 : 0;
        const attachment = job.offset.clone().applyQuaternion(handRotation).add(hand);
        item.body.position.copy(attachment);
        item.body.quaternion.copy(handRotation.clone().multiply(job.relativeRotation));
      }
      if (phase === 'push') {
        pusher.collisionFilterMask = -1;
        pusher.velocity.set((hand.x - pusher.position.x) / Math.max(dt, 0.001), (hand.y - pusher.position.y) / Math.max(dt, 0.001), (hand.z - pusher.position.z) / Math.max(dt, 0.001));
      } else {
        pusher.collisionFilterMask = 0;
        pusher.position.copy(hand);
        pusher.velocity.setZero();
      }
      const pointingDown = new THREE.Vector3(0, 0, 1).applyQuaternion(handRotation).z < -0.96;
      const contactError = hand.clone().sub(graspPoint).applyQuaternion(handRotation.clone().invert());
      const jawGap = (0.0158 + 0.074 * arm.current.gripper) * arm.base.scale.x;
      const contact = Math.abs(contactError.x) < 0.003 && Math.abs(contactError.y) < 0.005 &&
        Math.abs(contactError.z) < 0.005 && Math.abs(jawGap - job.strokeWidth) < 0.003 && pointingDown;
      container.dataset.grasp = JSON.stringify({side:arm.side, movingJawX:-new THREE.Vector3(1, 0, 0).applyQuaternion(handRotation).x, letter:item.letter, phase, contact, gap:jawGap, width:job.strokeWidth, error:contactError.toArray()});
      if (age >= duration && hand.distanceTo(destination) < (phase === 'place' ? 0.005 : phase === 'descend' ? 0.003 : 0.018) && (push || !['descend', 'close'].includes(phase) || pointingDown) && (phase !== 'close' || contact)) {
        if (phase === 'approach') transition('descend', now);
        else if (phase === 'descend' && push) {
          const displaced = constrainPlacement(item, new THREE.Vector3(pos.x + 0.035, pos.y + 0.012, pos.z));
          job.pushEnd = hand.clone().add(displaced.sub(new THREE.Vector3(pos.x, pos.y, pos.z)));
          transition('push', now);
        } else if (phase === 'descend') {
          arm.desired.gripper = gripperOpening(arm, job.strokeWidth);
          transition('close', now);
        } else if (phase === 'close') {
          container.dataset.lastGrasp = JSON.stringify({letter:item.letter, gap:jawGap, width:job.strokeWidth, error:contactError.toArray(), down:pointingDown});
          const inverseHand = handRotation.clone().invert();
          job.offset.set(pos.x - hand.x, pos.y - hand.y, pos.z - hand.z).applyQuaternion(inverseHand);
          job.relativeRotation.copy(inverseHand).multiply(itemRotation);
          const homePinch = new THREE.Vector3(1, 0, 0).applyQuaternion(job.relativeRotation.clone().invert());
          job.placementYaw = Math.atan2(homePinch.y, homePinch.x) - (arm.side === 'right' ? Math.PI : 0);
          job.held = true;
          item.body.type = CANNON.Body.KINEMATIC;
          item.body.collisionFilterMask = 0;
          item.body.velocity.setZero();
          item.body.angularVelocity.setZero();
          transition('lift', now);
        } else if (phase === 'lift') transition('carry', now);
        else if (phase === 'carry') transition('place', now);
        else if (phase === 'place') {
          job.held = false;
          settle(item);
          completeLetter(item, items);
          arm.desired.gripper = gripperOpening(arm, job.strokeWidth + jawClearance);
          transition('retreat', now);
        } else if (phase === 'push') transition('retreat', now);
        else {
          jobs[job.index] = null;
          job = null;
          if (!jobs.some(Boolean) && !items.some(dirty)) {
            for (const restingArm of arms) Object.assign(restingArm.desired, restingArm.rest);
            nextAction = Infinity;
          } else nextAction = now;
        }
      } else if (age > duration + 4) {
        // Unreachable targets are released, never teleported into a fake successful grasp.
        if (job.held) settle(job.item);
        deferLetter(item, now);
        arm.desired.gripper = gripperOpening(arm, job.strokeWidth + jawClearance);
        container.dataset.lastFailure = JSON.stringify({letter:item.letter, side:arm.side, phase, error:hand.distanceTo(destination)});
        jobs[job.index] = null;
        job = null;
        nextAction = now + 500;
      }
    }
    job = jobs.find(Boolean) || null;
    trail.visible = false;
    world.step(1 / 60, Math.min(dt, 0.05), 3);
    for (const item of items) {
      // Let gravity and contacts resolve sliding and small stacks naturally.
      if (item.body.type === CANNON.Body.DYNAMIC) {
        const quiet = item.body.velocity.lengthSquared() < 0.000004 && item.body.angularVelocity.lengthSquared() < 0.0004;
        item.quietTime = quiet ? (item.quietTime || 0) + dt : 0;
        if (item.quietTime > 0.4) item.body.sleep();
      }
      if (item.body.position.z < -0.15 || Math.abs(item.body.position.x) > 0.5 || Math.abs(item.body.position.y) > 0.45) {
        settle(item); item.body.position.copy(item.home); item.body.quaternion.set(0, 0, 0, 1);
      }
      item.mesh.position.copy(item.body.position);
      item.mesh.quaternion.copy(item.body.quaternion);
      if (reducedMotion.matches || drag?.item === item || jobs.some(task => task?.item === item)) {
        item.sway = item.swayVelocity = 0;
      } else {
        const step = Math.min(dt, 1 / 30);
        item.swayVelocity += (-100 * item.sway - 9 * item.swayVelocity) * step;
        item.sway = THREE.MathUtils.clamp(item.sway + item.swayVelocity * step, -0.045, 0.045);
        if (Math.abs(item.sway) + Math.abs(item.swayVelocity) < 0.0005) item.sway = item.swayVelocity = 0;
        item.mesh.rotateX(item.sway);
        item.mesh.position.z += Math.abs(Math.sin(item.sway)) * item.size.y / 2;
      }
    }
    container.dataset.activity = drag ? 'dragging' : jobs.map(task => task ? `${task.push ? 'push' : 'tidy'}-${task.phase}` : 'idle').join(',');
    container.dataset.letters = JSON.stringify(items.map(item => ({ letter: item.letter, x: +item.body.position.x.toFixed(3), y: +item.body.position.y.toFixed(3), z: +item.body.position.z.toFixed(3), settled: !dirty(item) })));
    return !!drag || !!job || items.some(item => item.body.sleepState !== CANNON.Body.SLEEPING || item.sway !== 0 || item.swayVelocity !== 0);
  }
  document.body.classList.add('has-letter-playground');
  container.dataset.playground = 'ready';
  const homeBounds = new THREE.Box3();
  for (const item of items) homeBounds.union(item.mesh.geometry.boundingBox.clone().translate(item.home));
  function setPalette(palette) {
    for (const { mesh } of items) {
      mesh.material[0].color.set(palette.face);
      mesh.material[1].color.set(palette.side);
      for (const material of mesh.material) {
        material.metalness = palette.metalness;
        material.roughness = palette.roughness;
      }
      mesh.children[0].material.color.set(palette.edge);
    }
  }
  return { homeBounds, update, setPalette, armBusy(index) { return !!jobs[index]; }, nextWake() { return enabled && !reducedMotion.matches && Number.isFinite(nextAction) ? Math.max(nextAction, nextAssignment) : null; }, suspend() { release(); cancelJob(); }, dispose() { disposed = true; cancelJob(); } };
}
