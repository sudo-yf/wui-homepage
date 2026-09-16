import * as THREE from 'three';

// The URDF frame lies on the fixed finger's inner face, not the jaw midpoint.
// STL calibration: inner face x=-7.9 mm, working finger depth z=-92 mm.
export function createGraspFrame(model) {
  const frame = new THREE.Object3D();
  frame.name = 'calibrated_grasp_center';
  frame.position.set(-0.014, 0, -0.006);
  model.links.gripper_frame_link.add(frame);
  return frame;
}
