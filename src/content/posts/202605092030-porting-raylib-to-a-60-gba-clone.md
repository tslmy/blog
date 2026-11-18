---
title: Porting Raylib to a $60 GBA clone
date: '2026-05-09T20:30:00Z'
---
Making new games for old consoles has long been a joy for indie game developers, a practice nicknamed "homebrewing". This fandom has arguably created a market for _[retro gaming handhelds](https://retrocatalog.com/retro-handhelds?displayMode=preview)_: low-power devices designed & manufactured today but meant for emulating consoles from the past. [Steward Fu's homepage](https://steward-fu.github.io/website/index.htm) alone lists 187 such products.

Game Boy Advance (GBA), a handheld from 25 years ago, is one of homebrewers' favorite target platform. Earlier this year, I dabbled in this hobby by [hacking an idle game](https://github.com/tslmy/sips) created in 2023. As it was perhaps apparent in [my previous post](https://blog.myli.page/adding-unit-tests-to-a-game-for-the-game-boy-advance-e5e9578ac207), that was my **first exposure to game development**.

One may ask: What if you want to learn to make games, but aren't feeling too nostalgic? **[Raylib](https://www.raylib.com/) is usually the answer**. It's a cross-platform framework that aims at putting fun into video game development. And it's popular: [on itch.io alone](https://itch.io/games/made-with-raylib), more than 700 games are made with Raylib.

Won't it be exciting to **port Raylib to those budget handhelds**, so that those developers can enjoy their creations on more tangible, dedicated gaming devices -- with joy sticks, D-pads, and everything? This shouldn't be hard, since many of those retro gaming handhelds run some kinds of Linux. To make it more interesting, I decided to raise the bar and aim at **rendering 3D scenes**.

## First iteration

I started with the [Miyoo Mini Flip (MMF)](https://lomiyoo.com/products/miyoo-mini-flip) that I bought in March. It presented an exciting challenge[^2]:
- The SSD202D SoC (dual-core ARM Cortex-A7) has **no 3D GPU**.
- EGL/GLES libraries are on disk, but `eglInitialize` failed.
- The [Simple DirectMedia Layer (SDL)](https://www.libsdl.org/) library, which I [highly regard](https://blog.myli.page/sdl-the-bridge-between-native-apps-and-the-web-917d1a80ead4), couldn't create a GL context on MMF.
- The only hint I could find is `/dev/fb0`, which represents the **framebuffer**[^1].

But besides `/dev/fb0`, MMF's Linux gives so little on the graphics stack that, had the OS been absent, it probably wouldn't make a difference at all.

It's funny that, only 4 months before I started this project, Raylib actually [started][apm] **adding support for OS-less situations**. Referred to as `PLATFORM_MEMORY` in [the makefile][cw], this configuration draws directly to the framebuffer. This is almost exactly what I needed. I just needed to [wire it up][wu] with `/dev/fb0`. The plan is thus:

1. Render the next frame in the program's memory space
2. Copy that frame into `/dev/fb0`
3. Tell the display to "flip the buffer"[^5]

[apm]: https://github.com/raysan5/raylib/commit/47a8b554bce936596e910aaeecf3d524c83ba97c
[cw]: https://github.com/raysan5/raylib/blob/c5fc7716229cef1727e7baf325a695a0ac00cf27/src/Makefile#L37-L38
[wu]: https://github.com/tslmy/raylib/commit/443acc300f948c6f99daf8f4deaed005b5730fdb#diff-347102e6d31df9888d75e091e8719bae10a768ef3201fc8499c8160a9f59cc6dR595-R624

Coding agent soon gave me a workable [build script](https://github.com/tslmy/raylib-on-miyoo-mini-flip/commit/e1b9aa6e020c9a4085af09c16ae5bdea9b8b11a0). But unfortunately, even when it's as rudimentary as [a spinning cube][dm], the scene can barely surpass 7 FPS on my MMP:

[pt]: https://github.com/raysan5/raylib/blob/c5fc7716229cef1727e7baf325a695a0ac00cf27/src/platforms/rcore_memory.c#L491
[sw]: https://github.com/raysan5/raylib/blob/c5fc7716229cef1727e7baf325a695a0ac00cf27/src/external/rlsw.h#L3
[dm]: https://github.com/tslmy/raylib-on-miyoo-mini-flip/commit/5f6c70a42246a24d063b9c51e10dceef57734aa4

[^1]: The framebuffer is a region in the memory, but [a Linux kernel driver](https://linux.die.net/man/4/fbdev) exposes at `/dev/fb0`, as if it's a separate device. This virtual device is often referred to as "FBDEV".

[^2]: Snippets of probe programs, their console logs on MMF, and more notes are available [here](https://github.com/tslmy/raylib-on-miyoo-mini-flip/blob/3e03953eefe12d397fca3f8288537b7df9e95f78/docs/raylib-port-notes.md).

[^5]: A prober program told me that this framebuffer is actually double the size of the actual display (actual 640x480; virtual 640x960). This means we are dealing with a [double buffering](https://www.lenovo.com/us/en/glossary/double-buffering/) situation, requiring us to "pan the display" from one buffer to the other upon every frame (using `FBIOPAN_DISPLAY`).

![](/vault-assets/Pasted%20image%2020260509202825.png)

## Swapping the software renderer

`PLATFORM_MEMORY` [requires][pt] that we use a software renderer, which by default wires to Raylib's [own `rlsw`][sw]. This young library renders into its own internal framebuffer, then you must call `glReadPixels` (via `rlCopyFramebuffer`) to transfer it to system memory every frame. I could confirm that **it was the bottleneck**: When I skipped the copying step (so the frames are rendered but never sent to the display), the FPS jumped to 25 FPS immediately.

Fortunately, `rlsw` implements [OpenGL 1.1](https://registry.khronos.org/OpenGL/specs/gl/glspec11.pdf). This version was released in 1997, when 3D rendering still heavily relied on CPUs. Even GPUs were, quoting [Reddit](https://www.reddit.com/r/GraphicsProgramming/comments/ll7pvw/comment/gnnzd5x/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button), "often actually an esoteric CPU running a software rasterizer." Therefore, this legacy edition has long been a popular target for software-based renderers. To us, this means **there are replacements**.

One of such replacements is [TinyGL](https://bellard.org/TinyGL/), which debuted in 2002. Compared to `rlsw`, which was [introduced](https://github.com/raysan5/raylib/pull/4832) only in 2025, TinyGL had more time to polish. Most prominently, it renders directly into `platform.pixels`, so there's no memory copy involved. I decided to **swap `rlsw` with TinyGL**.

To make them cooperate, I had to patch both [TinyGL][mytg] and [Raylib][myrl], in addition to some [build-time wiring & stubbing][btws]. Finally, it was time to switch the  `RAYLIB_GRAPHICS` flag -- We gave something to Raylib that is so mature and usable that we could switch it from "use the built-in software rasterizer" (`GRAPHICS_API_OPENGL_SOFTWARE`) to "use a provided OpenGL 1.1 API" (`GRAPHICS_API_OPENGL_11`). It felt like a great achievement.

[mytg]: https://github.com/tslmy/tinygl/tree/mmf
[myrl]: https://github.com/tslmy/raylib/tree/mmf
[btws]: https://github.com/tslmy/raylib-on-miyoo-mini-flip/commit/470be77674b3add4aa315b9bffebe9c4c46841bd

The result speaks for itself: Frame rate jumped to 25 FPS.

## What’s next?

I plan to write about how I managed to port my dice roller from THREE.js to this little device, which I teased about in [my previous post](https://blog.myli.page/adding-unit-tests-to-a-game-for-the-game-boy-advance-e5e9578ac207). Although we are only half way there, this is a good point to take a pause: Compared to a journey of how a specific app is built, the proof that a whole framework can run on budget gaming consoles will inspire more readers. 

I hope you are one of them. If you have a made something with Raylib and only played it on a computer, try putting it on a cheap handheld. It will feel different in your palms — I promise.
