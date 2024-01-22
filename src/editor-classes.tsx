import { ThreeEvent, useThree } from "@react-three/fiber"
import { useDrag } from "@use-gesture/react"
import { ReactNode } from "react"
import * as THREE from "three"

type Constructor = { new(...args: any[]): any }

type JSONTree = { name: string, args: { [key: string]: unknown }, children: JSONTree[] }

type PointCloud = [THREE.Vector3, Router | null][]

export class Node {
    parent?: Node
    key: string
    selected: boolean
    source = this // Points to the actual node in the case of snapshots
    name = 'Node'
    children = new Set<Node>()
    readonly isObject = false as const

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

    onSelectionChange(selected: boolean) {
        this.selected = selected
    }

    deleteSelf(silent = false) {
        this.parent?.remove(this)
        if (this.parent && !silent) this.onHeirarchyChange()
    }

    addTo(node: Node, silent = false) {
        node.add(this, silent)
        return this
    }

    findFirstDescendant(name: string) {
        return this.getDescendants(true).find(n => n.name === name)
    }

    findFirstAncestor(name: string) {
        let parent = this.parent
        while (parent) {
            if (parent.name === name) return parent
            parent = parent.parent
        }
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

    render(camera: THREE.PerspectiveCamera): ReactNode {
        return <>{Array.from(this.children).map(c => c.render(camera))}</>
    }

    getArgs(): { [key: string]: unknown } {
        return { key: this.key }
    }

    isSnapshot() {
        return this.source === this
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

// A node, but with a position and size that signal properly when changed
export class ObjectNode extends Node {
    position: THREE.Vector3
    size: THREE.Vector3
    readonly isObject = true as const

    constructor({ key, position = [0, 0, 0], size = [1, 1, 1] }: { key?: string, position?: THREE.Vector3Tuple, size?: THREE.Vector3Tuple } = {}) {
        super({ key })
        this.position = new THREE.Vector3(...position)
        this.size = new THREE.Vector3(...size)
    }

    setPosition(position: THREE.Vector3, silent = false) {
        this.source.position = position.clone()
        if (!silent) this.onHeirarchyChange()
    }

    setSize(size: THREE.Vector3, silent = false) {
        const newPosArray = size.toArray()
        const equal = this.size.toArray().every((component, i) => newPosArray[i] === component)

        if (!equal) {
            // Putting the code that sets the position inside of this condition because
            // it might just save me from dumbassery later when i accidentally depend on
            // the positon still being the same object it was, and not just having
            // the same value
            this.size = size.clone()
            if (!silent) this.onHeirarchyChange()
        }
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
    selected: Node | null = null
    isDragging = false

    constructor(model: Model) {
        this.model = model
        this.nodes = new Set()
    }

    select(node: Node) {
        if (node.source !== node) node = node.source

        console.log(`${node.constructor.name} selected!`)
        if (this.selected !== null) {
            this.unselect()
        }
        this.selected = node
        node.selected = true
        node.onSelectionChange(true)

        this.model.reRender()
    }

    unselect() {
        if (this.selected !== null) {
            this.selected.selected = false
            this.selected.onSelectionChange(false)
        }
        this.selected = null
    }

    setIsDragging(dragging: boolean) {
        this.isDragging = dragging
        this.model.reRender()
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

        /// K-MEANS ///
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
        /// K-MEANS ///

        // Snap each router to its nearest assigned node
        this.routers.forEach((r) => {
            const p = r.position.clone()
            const closest = Array.from(r.points).reduce((best, current) => {
                if (current.distanceTo(p) < best.distanceTo(p)) {
                    return current
                }
                return best
            })
            console.log(closest.toArray())
            r.source.setPosition(closest)
            console.log(r.position)
        })

        //Assign one more time, because positions have changed
        assign()

        console.log(`Solved with an average of ${this.getScore()}Mbps`)

        return this.getScore()
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

export class Floor extends ObjectNode {
    height: number
    name = 'Floor'

    constructor({ key, height = 0 }: { height?: number, key?: string } = {}) {
        super({ key })
        this.height = height
    }

    setPosition(position: THREE.Vector3, silent?: boolean): void {
        this.height = position.y
        super.setPosition(position, silent)
    }

    getArgs(): { [key: string]: unknown } {
        return { height: this.position.y || this.height, key: this.key }
    }

    render(camera: THREE.PerspectiveCamera) {
        this.position.y = this.height
        if (this.height !== 0) return <>{super.render(camera)}</>
        
        return (
            <>
                <gridHelper key={this.key} position={this.position} material={new THREE.LineBasicMaterial({ color: 'lightgray' })} />
                {super.render(camera)}
            </>
        )
    }
}

export class Room extends ObjectNode {
    color: string
    name = 'Room'

    constructor({ key, position = [0, 0, 0], size = [1, 1, 1] }: { key?: string, position?: THREE.Vector3Tuple, size?: THREE.Vector3Tuple } = {}) {
        super({ key, position, size })
        this.color = 'white'
    }

    getArgs() {
        return { key: this.key, position: this.position.toArray(), size: this.size.toArray() }
    }

    getPointCloud(): THREE.Vector3[] {
        const out: THREE.Vector3[] = []

        const density = 2
        const step = 1 / density
        // Not actually the bottom bottom corner, but tucked inside of the cube a bit depending on the used density.
        const bottomCorner = this.position.clone().add(this.size.clone().multiplyScalar(-0.5)).add(new THREE.Vector3(1, 1, 1).divideScalar(2 * density))
        for (let x = 0; x < this.size.x; x += step) {
            for (let y = 0; y < this.size.y; y += step) {
                for (let z = 0; z < this.size.z; z += step) {
                    out.push(bottomCorner.clone().add(new THREE.Vector3(x, y, z)))
                }
            }
        }
        function isEven(n: number) {
            return n % 2 === 0
        }
        if (isEven(this.size.x) || isEven(this.size.y) || isEven(this.size.z)) out.push(this.position.clone())

        return out
    }

    onSelectionChange(selected: boolean): void {
        this.color = selected ? 'lightblue' : 'white'
        // if (selected) {
        //     this.add(new Handles(), true)
        // } else {
        //     const handles = this.findFirstDescendant('Handles')
        //     if (handles) this.remove(handles, true)
        // }
    }

    render(camera: THREE.PerspectiveCamera) {
        const selectionManager = (this.findFirstAncestor('Model') as Model).source.selectionManager
        const position = this.source.position

        // Snap height to above the nearest floor
        const height = (this.findFirstAncestor('Floor') as Floor)?.height
        if (typeof height === 'number') {
            position.setY(height + this.size.y / 2)
        }

        // DEBUG: Visualize the point cloud
        const showPoints = false
        const pointColor = 'red'
        const points = showPoints ? this.source.getPointCloud().map(p => (
            <mesh position={p} material={new THREE.MeshPhongMaterial({ color: pointColor, flatShading: true, transparent: true, depthTest: false })} renderOrder={998}>
                <sphereGeometry args={[0.1]} />
            </mesh>
        )) : null

        function DraggableRoom({ room, onClick }: { room: Room, onClick: (e: ThreeEvent<MouseEvent>) => void }) {

            return (
                <mesh onClick={onClick} material={new THREE.MeshPhongMaterial({ color: room.color, flatShading: true, transparent: true })} position={position}>
                    <boxGeometry args={room.size.toArray()} />
                </mesh>
            )
        }

        return (
            <>
                <DraggableRoom key={this.key} room={this.source} onClick={() => selectionManager.select(this.source)} />
                {super.render(camera)}
                {points}
            </>
        )
    }
}

export class Router extends Node {
    name = 'Router'
    position: THREE.Vector3
    points = new Set<THREE.Vector3>()
    strength = 45
    halfDistance = 5 //The amount of units away it takes for the signal strength to decrease by half

    constructor({ key, position = [0, 0, 0] }: { key?: string, position?: THREE.Vector3Tuple } = {}) {
        super({ key })
        this.position = new THREE.Vector3(...position)
    }

    getArgs(): { [key: string]: unknown } {
        return { key: this.key, position: this.position.toArray() }
    }

    getStrength(at: THREE.Vector3) {
        const distance = this.position.distanceTo(at)

        return this.strength * (1 / 2) ** (distance / this.halfDistance)
    }

    setPosition(p: THREE.Vector3, silent = false) {
        this.position = p.clone()
        if (!silent) this.onHeirarchyChange()
    }

    render() {
        const color = 'teal'
        return (
            <mesh key={this.key} position={this.position} material={new THREE.MeshPhongMaterial({ color, flatShading: true, transparent: true, depthTest: false })} renderOrder={999}>
                <sphereGeometry args={[0.25]} />
            </mesh>
        )
    }
}


// export class Handles extends Node {
//     declare parent?: Node
//     target?: ObjectNode
//     name = 'Handles'

//     add(node: ObjectNode, silent = false) {
//         if (!node.position) throw Error(`Node ${this.constructor.name} is being parented to node ${node.constructor.name}, which does not have a position!`)
//         super.add(node, silent)
//     }

//     setTarget(node: ObjectNode) {
//         this.target = node
//     }

//     render(camera: THREE.PerspectiveCamera) {
//         if (!this.target && this.parent && (this.parent as ObjectNode)?.position) {
//             this.target = this.parent as ObjectNode
//         }



//         const getMouseHitPlane = (point: THREE.Vector3, along: THREE.Vector3) => {
//             const cameraLook = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
//             const cross = cameraLook.clone().cross(along)
//             const normal = cross.clone().cross(cameraLook)
//             const plane = new THREE.Plane(normal, point.clone().dot(normal))

//             return plane
//         }

//         const HandlesComponent = ({ onSizeChange }: { onSizeChange: (size: Partial<{ x: number, y: number, z: number }>) => void }) => {
//             if (!this.target) return (<></>)

//             const bindUp = useDrag(({ active, movement: [x, y], timeStamp, event }) => {
//                 if (active) {

//                 }
//                 console.log('Up')
//             })

//             const bindForward = useDrag(({ active, movement: [x, y], timeStamp, event }) => {
//                 if (active) {

//                 }
//                 console.log('Forward')
//             })

//             const bindRight = useDrag(({ active, movement: [x, y], timeStamp, event }) => {
//                 if (active) {

//                 }
//                 console.log('Right')
//             })

//             const pos = this.target.position
//             const right = new THREE.Vector3(1, 0, 0)
//             const up = new THREE.Vector3(0, 1, 0)
//             const forward = new THREE.Vector3(0, 0, 1)
//             const scale = (v0: THREE.Vector3, s: number) => v0.clone().multiplyScalar(s)
//             const mult = (v0: THREE.Vector3, v1: THREE.Vector3) => new THREE.Vector3().multiplyVectors(v0, v1)
//             const add = (v0: THREE.Vector3, v1: THREE.Vector3) => v0.clone().add(v1)
//             return (
//                 <>
//                     <arrowHelper {...bindForward} key={this.key} args={[forward, add(pos, mult(this.target.size, scale(forward, 0.5))), 1.5, 'blue', 1, 0.5]} />
//                     <arrowHelper {...bindUp} key={this.key + 1} args={[up, add(pos, mult(this.target.size, scale(up, 0.5))), 1.5, 'green', 1, 0.5]} />
//                     <arrowHelper {...bindRight} key={this.key + 2} args={[right, add(pos, mult(this.target.size, scale(right, 0.5))), 1.5, 'red', 1, 0.5]} />
//                 </>
//             )

//         }

//         return (
//             <>
//                 <HandlesComponent onSizeChange={() => {}}/>
//                 {super.render(camera)}
//             </>
//         )
//     }
// }

const fromJSONDictionary: { [key: string]: (...args: any[]) => Node } = {
    "Node": (...args) => new Node(...args),
    "Model": (...args) => new Model(...args),
    "Floor": (...args) => new Floor(...args),
    "Room": (...args) => new Room(...args),
    "Router": (...args) => new Router(...args)
}