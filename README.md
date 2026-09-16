# Introduction
99% coded by Claude Code LOL XD
> I only giving him order to code things based on my architecture requests

The purpose of this repository is to simulate an activity between IoT sensors (for water level) and the server which will handle it

# Some details
The original stack lives under `ias_prototype_origin/`, with 4 different directories:
* ias_backend: handle the backend side using NodeJS
* ias_frontend: handle the frontend using Vite-VueJs
* ias_infra: handle the containerized infrastructure in docker compose
* ias_simulate: used for a sensor simulation data

There's also `ias_prototype/`: a separate Rubber Dam monitoring/control stack
(its own ias_backend/ias_frontend/ias_infra, unrelated in domain to the one
above), which reuses `ias_prototype_origin/ias_simulate` for its device
simulator.

> This is an only for-fun repository XD\
> Whelp, but it also doesn't rule out the possibility to make it as my own reference in the future👀
