"""
maya_export_tail.py — export the LP chameleon tail joint chain to the
portfolio's hero rig sidecar (assets/data/tail_rig.json).

Run inside Maya (2022+, Python 3) with the LP rig scene open:

    import maya_export_tail; maya_export_tail.export()

or from the Script Editor:

    exec(open(r"C:/path/to/portfolio_giacobbi/tools/maya_export_tail.py").read()); export()

What it writes (per joint, root → tip): name, world-space REST position
(bind pose, all controls zeroed — you'll be asked to confirm), an optional
per-joint radius (uses the joint's `radius` attribute), and the DAG order.

The web loader (assets/js/rig/tail-chain.js → loadSpec) validates 8–24
joints, projects onto the chain's best-fit plane, normalises total length
to 1, and falls back to the procedural coil on ANY problem — so a bad
export can never break the site, it just won't be used.
"""
import json
import os

try:
    import maya.cmds as cmds  # type: ignore
except ImportError:  # allow import outside Maya for linting
    cmds = None

DEFAULT_ROOT_CANDIDATES = ("tail_01", "tail_jnt_01", "jnt_tail_01", "C_tail_01_JNT", "tail01_jnt")
OUT_REL = os.path.join("..", "assets", "data", "tail_rig.json")


def _find_root(explicit=None):
    if explicit and cmds.objExists(explicit):
        return explicit
    for n in DEFAULT_ROOT_CANDIDATES:
        if cmds.objExists(n):
            return n
    sel = cmds.ls(selection=True, type="joint") or []
    if sel:
        return sel[0]
    raise RuntimeError("Select the tail ROOT joint (or pass root='...').")


def _chain_from(root):
    chain = [root]
    cur = root
    while True:
        kids = cmds.listRelatives(cur, children=True, type="joint") or []
        if not kids:
            break
        # follow the child that continues the chain (first joint child)
        cur = kids[0]
        chain.append(cur)
    return chain


def export(root=None, out_path=None, project="LP"):
    if cmds is None:
        raise RuntimeError("Run inside Maya.")
    root = _find_root(root)
    chain = _chain_from(root)
    if not (8 <= len(chain) <= 24):
        raise RuntimeError(f"Chain has {len(chain)} joints; the web rig expects 8–24. "
                           "Pick a different root or export a sub-chain.")
    ok = cmds.confirmDialog(
        title="Export tail rig",
        message=(f"Export {len(chain)} joints from '{root}' in the CURRENT pose?\n"
                 "Make sure this is the BIND / rest pose (controls zeroed)."),
        button=["Export", "Cancel"], defaultButton="Export", cancelButton="Cancel")
    if ok != "Export":
        return None

    unit = cmds.currentUnit(query=True, linear=True)
    up = cmds.upAxis(query=True, axis=True)
    joints = []
    for j in chain:
        pos = cmds.xform(j, query=True, worldSpace=True, translation=True)
        r = cmds.getAttr(f"{j}.radius") if cmds.attributeQuery("radius", node=j, exists=True) else 1.0
        joints.append({"name": j.split("|")[-1], "rest": [round(v, 5) for v in pos], "r": round(float(r), 4)})

    data = {"unit": unit, "up": up, "project": project, "source": "maya", "joints": joints}
    here = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
    out_path = out_path or os.path.normpath(os.path.join(here, OUT_REL))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
    print(f"[tail_rig] wrote {len(joints)} joints → {out_path}")
    return out_path
