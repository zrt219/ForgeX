uniform float uTime;
uniform float uPulse;

varying vec2 vUv;
varying vec3 vWorldPosition;

void main() {
  float ripple = sin((vUv.x + uTime * 0.015) * 40.0) * 0.004;
  ripple += cos((vUv.y - uTime * 0.01) * 32.0) * 0.004;
  float horizon = smoothstep(0.0, 0.8, vUv.y);
  float fresnel = pow(1.0 - abs(dot(normalize(vec3(0.0, 1.0, 0.0)), normalize(vec3(vWorldPosition.x, 4.0, vWorldPosition.z)))), 2.0);

  vec3 deep = vec3(0.042, 0.092, 0.17);
  vec3 reflected = vec3(0.19, 0.24, 0.42);
  vec3 color = mix(deep, reflected, horizon);
  color += vec3(0.06, 0.08, 0.14) * fresnel;
  color += vec3(0.08, 0.11, 0.16) * uPulse * 0.16;

  float alpha = 0.42 + fresnel * 0.18 + ripple;
  gl_FragColor = vec4(color, alpha);
}
