# RISC-NPU Article

An illustrated engineering article about a custom processor's MAC extension, complete-kernel execution costs, and FPGA resource trade-offs.

[Read the article](https://jaundel.github.io/risc-npu-article/) · [Hardware and experiments](https://github.com/Jaundel/RISC-NPU)

`index.html` and `style.css` contain the article. `assets/figures/` contains the generated plots, and `assets/data/` contains the simulation results, fit summaries, manifests, and reproduction archive.

To preview locally, serve this directory with a static HTTP server:

```sh
python -m http.server 8767 --bind 127.0.0.1
```

Open http://127.0.0.1:8767/. The page needs no JavaScript framework or build step. The reproduction archive includes the hardware sources and commands used to generate the evidence.
