import { useEffect, useRef } from 'react'

const shaderVertexSource = `
  attribute vec2 a_position;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

const shaderFragmentSource = `
  precision highp float;

  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec2 u_pointer;
  uniform float u_dark;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 point = uv * 2.0 - 1.0;
    point.x *= u_resolution.x / u_resolution.y;

    float time = u_time * 0.08;
    float grain = noise(point * 2.8 + vec2(time, -time * 0.65));
    float drift = sin((point.x * 1.6 + point.y * 0.8) * 3.0 + grain * 2.4 + time * 4.0);
    float distanceFromPointer = distance(point, vec2(u_pointer.x * 1.15, -u_pointer.y * 0.9));
    float touch = smoothstep(0.85, 0.0, distanceFromPointer);
    float ring = smoothstep(0.035, 0.0, abs(distance(point, vec2(-0.14, 0.08)) - 0.44));

    vec3 paper = mix(
      vec3(0.90, 0.82, 0.69),
      vec3(0.13, 0.12, 0.10),
      u_dark
    );
    vec3 ink = mix(
      vec3(0.30, 0.16, 0.10),
      vec3(0.75, 0.48, 0.32),
      u_dark
    );
    vec3 paprika = mix(
      vec3(0.75, 0.24, 0.12),
      vec3(0.86, 0.45, 0.26),
      u_dark
    );

    vec3 color = paper;
    color = mix(color, ink, 0.08 + 0.06 * (drift * 0.5 + 0.5));
    color += paprika * (touch * 0.10 + ring * 0.16);
    color += vec3(0.08, 0.055, 0.025) * grain * 0.12;

    gl_FragColor = vec4(color, 0.62);
  }
`

export function InkField({ isDark }: { isDark: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const contextAttributes: WebGLContextAttributes = {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    }
    const webgl2 = canvas.getContext('webgl2', contextAttributes)
    const gl = webgl2 ?? canvas.getContext('webgl', contextAttributes)

    if (!gl) {
      canvas.dataset.renderer = 'css-fallback'
      return
    }

    const surface = canvas
    const renderer = gl
    const vertexShader = renderer.createShader(renderer.VERTEX_SHADER)
    const fragmentShader = renderer.createShader(renderer.FRAGMENT_SHADER)
    if (!vertexShader || !fragmentShader) return

    renderer.shaderSource(vertexShader, shaderVertexSource)
    renderer.shaderSource(fragmentShader, shaderFragmentSource)
    renderer.compileShader(vertexShader)
    renderer.compileShader(fragmentShader)

    if (
      !renderer.getShaderParameter(vertexShader, renderer.COMPILE_STATUS) ||
      !renderer.getShaderParameter(fragmentShader, renderer.COMPILE_STATUS)
    ) {
      surface.dataset.renderer = 'css-fallback'
      return
    }

    const program = renderer.createProgram()
    renderer.attachShader(program, vertexShader)
    renderer.attachShader(program, fragmentShader)
    renderer.linkProgram(program)

    if (!renderer.getProgramParameter(program, renderer.LINK_STATUS)) {
      surface.dataset.renderer = 'css-fallback'
      return
    }

    const buffer = renderer.createBuffer()
    const positionLocation = renderer.getAttribLocation(program, 'a_position')
    const timeLocation = renderer.getUniformLocation(program, 'u_time')
    const resolutionLocation = renderer.getUniformLocation(
      program,
      'u_resolution',
    )
    const pointerLocation = renderer.getUniformLocation(program, 'u_pointer')
    const darkLocation = renderer.getUniformLocation(program, 'u_dark')
    if (
      positionLocation < 0 ||
      !timeLocation ||
      !resolutionLocation ||
      !pointerLocation ||
      !darkLocation
    )
      return

    renderer.bindBuffer(renderer.ARRAY_BUFFER, buffer)
    renderer.bufferData(
      renderer.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      renderer.STATIC_DRAW,
    )
    renderer.useProgram(program)
    renderer.enableVertexAttribArray(positionLocation)
    renderer.vertexAttribPointer(
      positionLocation,
      2,
      renderer.FLOAT,
      false,
      0,
      0,
    )
    renderer.disable(renderer.DEPTH_TEST)
    renderer.enable(renderer.BLEND)
    renderer.blendFunc(renderer.SRC_ALPHA, renderer.ONE_MINUS_SRC_ALPHA)

    let width = 0
    let height = 0
    let frame = 0
    let isVisible = true
    const pointer = { x: 0, y: 0 }
    const pointerTarget = { x: 0, y: 0 }
    const pointerResponse = 0.14
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    function resize() {
      const rect = surface.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(1, Math.floor(rect.width * pixelRatio))
      height = Math.max(1, Math.floor(rect.height * pixelRatio))
      if (surface.width !== width || surface.height !== height) {
        surface.width = width
        surface.height = height
        renderer.viewport(0, 0, width, height)
      }
    }

    function render(time: number) {
      frame = 0
      if (!isVisible) return
      pointer.x += (pointerTarget.x - pointer.x) * pointerResponse
      pointer.y += (pointerTarget.y - pointer.y) * pointerResponse
      renderer.clearColor(0, 0, 0, 0)
      renderer.clear(renderer.COLOR_BUFFER_BIT)
      renderer.uniform1f(timeLocation, time)
      renderer.uniform2f(resolutionLocation, width, height)
      renderer.uniform2f(pointerLocation, pointer.x, pointer.y)
      renderer.uniform1f(darkLocation, isDark ? 1 : 0)
      renderer.drawArrays(renderer.TRIANGLES, 0, 3)
      if (!reducedMotion) frame = requestAnimationFrame(render)
    }

    function handlePointerMove(event: PointerEvent) {
      const rect = surface.getBoundingClientRect()
      pointerTarget.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointerTarget.y = ((event.clientY - rect.top) / rect.height) * 2 - 1
    }

    const resizeObserver = new ResizeObserver(resize)
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting
      if (isVisible && !reducedMotion && !frame)
        frame = requestAnimationFrame(render)
    })
    resizeObserver.observe(surface)
    visibilityObserver.observe(surface)
    surface.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    })
    resize()
    render(0)

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      visibilityObserver.disconnect()
      surface.removeEventListener('pointermove', handlePointerMove)
      renderer.deleteBuffer(buffer)
      renderer.deleteProgram(program)
      renderer.deleteShader(vertexShader)
      renderer.deleteShader(fragmentShader)
    }
  }, [isDark])

  return <canvas className="ink-field" ref={canvasRef} aria-hidden="true" />
}
