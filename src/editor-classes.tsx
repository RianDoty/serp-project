import { Point, Points } from "@react-three/drei"
import { ThreeElements } from "@react-three/fiber"
import { ReactNode } from "react"
import * as THREE from "three"

type Constructor = { new(...args: any[]): any }

type JSONTree = { name: string, args: { [key: string]: unknown }, children: JSONTree[] }

type PointCloud = [THREE.Vector3, Router|null][]

export class Node {
    parent?: Node
    key: string
    selected: boolean
    source = this // Points to the actual node in the case of snapshots
    name = 'Node'
    children = new Set<Node>()

    constructor({ key = String(Math.floor(Math.random() * 1000000000)) }: { key?: string } = {}) {
        this.key = key
        this.selected = false
    }

    add(node: Node, silent = false) {
        this.children.add(node)
        node.parent = this
        if (!silent) this.onHeirarchyChange()
    }

    remove(node: Node, silent = false) {
        this.children.delete(node)
        delete node.parent
        if (!silent) this.onHeirarchyChange()
    }

    deleteSelf(silent = false) {
        this.parent?.remove(this)
        if (this.parent && !silent) this.onHeirarchyChange()
    }

    addTo(node: Node, silent = false) {
        node.add(this, silent)
        return this
    }

    findFirst(name: string) {
        return this.getDescendants(true).find(n => n.name === name)
    }

    getDescendants(includeThis = false): Node[] {
        const out = Array.from(this.children).map(c => c.getDescendants(true)).flat()
        if (includeThis) out.push(this)
        return out
    }

    onHeirarchyChange() {
        if (this.source !== this && !this.parent) console.warn('Snapshots should not be changed! Use Node.source to change the actual heirarchy instead.')
        this.parent?.onHeirarchyChange()
    }

    clone(): this {
        const out: this = new (this.constructor as Constructor)(this.getArgs())
        out.selected = this.selected
        return out
    }

    generateSnapshot(): this {
        const out = this.clone()
        out.source = this
        this.children.forEach(c => {
            out.add(c.generateSnapshot(), true)
        })
        return out
    }

    render(): ReactNode {
        return <>{Array.from(this.children).map(c => c.render())}</>
    }

    getArgs(): { [key: string]: unknown } {
        return { key: this.key }
    }

    toJSON(): JSONTree {
        // Throw a warning if a non-Node class has its name set as Node,
        // because that's probably just me being a dumbass.
        if (this.name !== this.constructor.name && this.name === 'Node') console.warn(`Class ${this.constructor.name} has property "name" set as ${this.name}. Was the name properly set?`)

        const out = { name: this.name, args: this.getArgs(), children: Array.from(this.children).map(c => c.toJSON()) }

        return out
    }

    static fromJSON(json: JSONTree): Node {
        const out = fromJSONDictionary[json.name](json.args)

        json.children.forEach(c => {
            out.add(this.fromJSON(c))
        })

        return out
    }

    //Keeps the node this is called on, replaces children.
    replace(node: Node) {
        this.children.forEach(c => this.remove(c, true))
        node.children.forEach(c => this.add(c, true))

        this.onHeirarchyChange()
    }

    /*
    Returns the entire tree under this node as a string

    Model
    ⌞_Floor1
    ⌞__Room1
    ⌞___Router1
    ⌞__Room2
    etc.
    */
    tree() {
        function className(obj: Object) {
            return obj.constructor.name
        }
        let out = className(this)
        function addChildrenToOut(node: Node, padding = 1) {
            node.children.forEach(n => {
                out += `\n⌞${'_'.repeat(padding)}${className(n)}`
                addChildrenToOut(n, padding + 1)
            })
        }
        addChildrenToOut(this)

        return out
    }
}

export class Model extends Node {
    declare children: Set<Node>
    listeners: Set<() => void>
    snapshot!: Model
    selectionManager: SelectionManager
    optimizationManager: OptimizationManager
    name = 'Model'

    constructor({ key }: { key?: string } = {}) {
        super({ key })
        this.listeners = new Set();
        this.selectionManager = new SelectionManager(this)
        this.optimizationManager = new OptimizationManager(this)

        this.subscribe = this.subscribe.bind(this)
        this.getSnapshot = this.getSnapshot.bind(this)
    }

    subscribe(listener: () => void) {
        console.log('Subscribed!')
        this.listeners.add(listener)
        return () => {
            console.log('Unsubscribed!')
            this.listeners.delete(listener)
        }
    }

    onHeirarchyChange() {
        super.onHeirarchyChange() // For completeness, even if there is never a parent
        this.optimizationManager.onHeirarchyChange()
        this.reRender()
    }

    onSelectionChange() {
        this.reRender()
    }

    reRender() {
        console.log('Model re-rendering')
        this.generateSnapshot()
        this.listeners.forEach(l => l())
    }

    generateSnapshot() {
        this.snapshot = super.generateSnapshot()
        return this.snapshot as this
    }

    getSnapshot() {
        return this.snapshot || this.generateSnapshot()
    }
}

// Manages which node is currently selected
export class SelectionManager {
    nodes: Set<Node>
    model: Model
    selected: Node | null

    constructor(model: Model) {
        this.model = model
        this.nodes = new Set()
        this.selected = null
    }

    select(node: Node) {
        if (node.source !== node) node = node.source

        console.log(`${node.constructor.name} selected!`)
        if (this.selected !== null) {
            this.selected.selected = false
        }
        this.selected = node
        node.selected = true

        this.model.onSelectionChange()
    }

    unselect() {
        this.selected = null
    }

    isSelected(node: Node) {
        return node === this.selected || node.key === this.selected?.key
    }

    refreshList() {
        this.nodes = new Set(this.model.getDescendants(true))
    }
}

// The big hochi mama. Implements the k-means clustering algoritm for routers
export class OptimizationManager {
    model: Model
    rooms = new Set<Room>()
    routers = new Set<Router>()

    constructor(model: Model) {
        this.model = model
    }

    onHeirarchyChange() {
        this.rooms = new Set(this.model.getDescendants(true).filter(n => n.name === 'Room') as Room[])
    }

    optimize(routerCount?: number) {
        const rooms = Array.from(this.rooms)
        // The list of points that are to be optimized towards.
        const observations: PointCloud = rooms.flatMap(r => r.getPointCloud()).map(o => [o, null])
        if (typeof routerCount !== 'number' || routerCount > rooms.length) routerCount = rooms.length


        console.log(`Optimizing for ${routerCount} routers!`)
        //Dispose of old routers
        this.routers.forEach(r => r.deleteSelf())

        //Generating new routers
        this.routers = new Set<Router>()
        for (let i = 0; i < routerCount; i++) {
            this.routers.add(new Router({ position: rooms[i].position.clone().toArray() }).addTo(this.model))
        }

        let iter = 0
        let reassignments = 0
        const assign = () => {
            observations.forEach((observation) => {
                const [o, router] = observation
                const closest = Array.from(this.routers).reduce((best, current) => {
                    if (current.position.distanceTo(o) < best.position.distanceTo(o)) {
                        return current
                    }
                    return best
                })
                if (router !== closest) {
                    router?.points.delete(o)
                    observation[1] = closest
                    closest.points.add(o)
                    reassignments++
                }
            })
        }
        do {
            iter++
            reassignments = 0

            //Assignment step
            assign()

            //Update step
            this.routers.forEach(r => {
                //Take the mean of all of the router's points, and assign it as the new position
                const sum = Array.from(r.points).reduce((accumulator, p) => accumulator.add(p), new THREE.Vector3())
                const mean = sum.divideScalar(r.points.size)

                r.setPosition(mean, true)
            })
        } while (iter < 10 && reassignments > 0)

        // Snap each router to its nearest assigned node
        this.routers.forEach((r) => {
            const p = r.position
            const closest = Array.from(r.points).reduce((best, current) => {
                if (current.distanceTo(p) < best.distanceTo(p)) {
                    return current
                }
                return best
            })
            r.position = closest
        })

        //Assign one more time, because positions have changed
        assign()

        console.log(`Solved with an average of ${this.getScore()}Mbps`)
    }

    getScore(): number {
        let pointCount = 0
        const routersArray = Array.from(this.routers)

        const sumOfStrengths = routersArray.reduce((acc1, r) => {
            pointCount += r.points.size
            return acc1 + Array.from(r.points).reduce((acc2, p) => (acc2 + r.getStrength(p)), 0)
        }, 0)

        const averageStrength = sumOfStrengths / pointCount

        return averageStrength
    }
}

export class Floor extends Node {
    height: number
    name = 'Floor'

    constructor({ key, height = 0 }: { height?: number, key?: string } = {}) {
        super({ key })
        this.height = height
    }

    getArgs(): { [key: string]: unknown } {
        return { height: this.height, key: this.key }
    }

    render() {
        return (
            <>
                <gridHelper key={this.key} position={new THREE.Vector3(0, this.height, 0)} />
                {Array.from(this.children).map(c => c.render())}
            </>
        )
    }
}

export class Room extends Node {
    position: THREE.Vector3
    size: THREE.Vector3
    name = 'Room'

    constructor({ key, position = [0, 0, 0], size = [1, 1, 1] }: { key?: string, position?: THREE.Vector3Tuple, size?: THREE.Vector3Tuple } = {}) {
        super({ key })
        this.position = new THREE.Vector3(...position)
        this.size = new THREE.Vector3(...size)
    }

    getArgs() {
        return { key: this.key, position: this.position.toArray(), size: this.size.toArray() }
    }

    getPointCloud(): THREE.Vector3[] {
        const out: THREE.Vector3[] = []

        for (let x = 0; x < this.size.x; x++) {
            // Don't optimize for points more than 2 above the ground,
            // because there usually aren't computers that high.
            for (let y = 0; y < this.size.y && y <= 2; y++) {
                for (let z = 0; z < this.size.z; z++) {
                    out.push(this.position.clone().add(new THREE.Vector3(x, y, z)))
                }
            }
        }

        return out
    }

    render() {
        const position = new THREE.Vector3().copy(this.position)

        const height = (this?.parent as Floor)?.height
        if (typeof height === 'number') {
            position.setY(height + this.size.y / 2)
        }

        const color = this.selected ? 'lightblue' : 'white'
        return (
            <>
                <mesh key={this.key} material={new THREE.MeshPhongMaterial({ color, flatShading: true, transparent: true })} position={position}>
                    <boxGeometry args={this.size.toArray()} />
                    {Array.from(this.children).map(c => c.render())}
                </mesh>
            </>
        )
    }
}

export class Router extends Node {
    name = 'Router'
    position: THREE.Vector3
    points = new Set<THREE.Vector3>()
    strength = 1
    halfDistance = 5 //The amount of units away it takes for the signal strength to decrease by half

    constructor({ key, position = [0, 0, 0] }: { key?: string, position?: THREE.Vector3Tuple } = {}) {
        super({ key })
        this.position = new THREE.Vector3(...position)
    }

    getStrength(at: THREE.Vector3) {
        const distance = this.position.distanceTo(at)

        return this.strength * (1 / 2) ** (distance / this.halfDistance)
    }

    setPosition(p: THREE.Vector3, silent=false) {
        this.position = p.clone()
        if (!silent) this.onHeirarchyChange()
    }
}

const fromJSONDictionary: { [key: string]: (...args: any[]) => Node } = {
    "Node": (...args) => new Node(...args),
    "Model": (...args) => new Model(...args),
    "Floor": (...args) => new Floor(...args),
    "Room": (...args) => new Room(...args),
    "Router": (...args) => new Router(...args)
}