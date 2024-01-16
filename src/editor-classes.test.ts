import { Floor, Model } from "./editor-classes";

test('Nodes can be', () => {
    const myModel = new Model()
    const floor1 = new Floor().addTo(myModel);
    new Floor().addTo(floor1)
    console.log(myModel.tree())
})