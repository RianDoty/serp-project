import { Object3DNode } from "@react-three/fiber"
import { Children } from "react"
import * as THREE from "three"

export class Node {
    parent: Node | null
    children: Set<Node>

    constructor(parent: Node | null = null) {
        this.parent = parent
        this.children = new Set()
        if (parent) parent.add(this)
    }

    add(node: Node) {
        this.children.add(node)
        node.parent = this
    }

    remove(node: Node) {
        this.children.delete(node)
        node.parent = null
    }

    addTo(node: Node) {
        node.add(this)
        return this
    }

    /*
    Returns the entire tree under this node as a string

    Model
     ⌞Floor1
      ⌞Room1
       ⌞Router1
      ⌞Room2
    etc.
    */
    tree() {
        function className(obj: Object) {
            return obj.constructor.name
        }
        let out = className(this)
        function addChildrenToOut(node: Node, padding = 1) {
            node.children.forEach(n => {
                out += `\n${' '.repeat(padding)}⌞${className(n)}`
                addChildrenToOut(n, padding + 1)
            })
        }
        addChildrenToOut(this)

        return out
    }
}

export class ModelNode extends Node {
    model!: Model
    declare children: Set<ModelNode>

    constructor(parent: Node | null = null) {
        super(parent)
    }

    add(node: ModelNode) {
        super.add(node)
        this.model.addToModel(node)
    }

    remove(node: ModelNode) {
        super.remove(node)
        this.model.onModelChange()
    }

    delete() {
        this.parent?.remove(this)
    }

    generateSnapshot(parent: Node) {
        return new ModelNode(parent)
    }

    render() {
        return <></>
    }
}

type Snapshot = Node
export class Model extends Node {
    declare children: Set<ModelNode>
    listeners: Set<() => void>
    snapshot!: Snapshot
    isSnapshot: boolean

    constructor(isSnapshot = false) {
        super()
        this.listeners = new Set();

        this.subscribe = this.subscribe.bind(this)
        this.getSnapshot = this.getSnapshot.bind(this)

        this.isSnapshot = isSnapshot
    }

    add(node: ModelNode) {
        super.add(node)
        node.model = this
        if (!this.isSnapshot && node.children) this.onModelChange()
    }

    subscribe(listener: () => void) {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    onModelChange() {
        if (!this.isSnapshot) {
            console.log('Pinging ')
            this.generateSnapshot()
            this.listeners.forEach(l => l())
        }
    }

    generateSnapshot() {
        const out = new Model(true)
        this.children.forEach(c => {
            c.generateSnapshot(out)
        })
        this.snapshot = out
        return out
    }

    getSnapshot() {
        return this.snapshot || this.generateSnapshot()
    }

    addToModel(node: ModelNode) {
        node.model = this
        this.onModelChange()
    }

    render() {
        return <>{Array.from(this.children).map(c => c.render())}</>
    }
}

export class Floor extends ModelNode {
    height: number

    constructor(parent: Model, height: number = 0) {
        super(parent)
        this.model = parent
        this.height = height
    }

    generateSnapshot(parent: Model) {
        const out = new Floor(parent)
        this.children.forEach(c => {
            const snapshotNode = c.generateSnapshot(out)
            out.children.add(snapshotNode)
            snapshotNode.parent = out
        })
        return out
    }

    render() {
        return (
            <>
                <gridHelper position={new THREE.Vector3(0, this.height, 0)} />
                {Array.from(this.children).map(c => c.render())}
            </>
        )
    }
}

export class Room extends ModelNode {
    parent: Floor | null
    position: THREE.Vector3
    size: THREE.Vector3

    constructor(parent: Floor | null, px = 0, pz = 0, sx = 1, sy = 1, sz = 1) {
        super(parent)
        this.parent = parent
        this.position = new THREE.Vector3(px, (this.parent?.height ?? 0) + sy / 2, pz)
        this.size = new THREE.Vector3(sx, sy, sz)
    }

    render() {
        return (
            <mesh material={new THREE.MeshPhongMaterial({ color: 'white', flatShading: true })} position={this.position}>
                <boxGeometry />
            </mesh>
        )
    }
}