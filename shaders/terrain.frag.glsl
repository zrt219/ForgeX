uniform float uTime;
uniform float uPulse;
uniform vec3 uFogColor;

varying vec3 vWorldPosition;
varying vec3 vViewPosition;
varying float vElevation;
varying float vSlopeMask;

float contour(vec2 p, float scale) {
  vec2 grid = abs(fract(p * scale - 0.5) - 0.5) / fwidth(p * scale);
  float line = min(grid.x, grid.y);
  return 1.0 - min(line, 1.0);
}

void main() {
  float distanceToCamera = length(vViewPosition);
  float baseMix = smoothstep(-1.2, 4.8, vElevation);
  float summitMix = smoothstep(5.0, 9.9, vElevation);
  float snowMask = smoothstep(6.3, 9.9, vElevation) * (1.0 - vSlopeMask * 0.45);
  float fog = smoothstep(18.0, 68.0, distanceToCamera);
  float faintGrid = contour(vWorldPosition.xz, 0.34) * 0.035;

  vec3 baseColor = vec3(0.052, 0.102, 0.188);
  vec3 midColor = vec3(0.252, 0.203, 0.382);
  vec3 peakColor = vec3(0.95, 0.96, 0.99);

  vec3 color = mix(baseColor, midColor, baseMix);
  color = mix(color, peakColor, snowMask);
  color += vec3(0.06, 0.08, 0.15) * summitMix * 0.16;
  color += vec3(0.07, 0.1, 0.18) * uPulse * 0.12;
  color += faintGrid;
  color = mix(color, uFogColor, fog);

  gl_FragColor = vec4(color, 1.0);
}
