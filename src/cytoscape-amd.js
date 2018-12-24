export default function register (cytoscape) {

  cytoscape('core', 'addEdge', addEdge)

  function addEdge (edge) {
    console.log('addEdge', edge)
    if (Array.isArray(edge)) {
      edge.forEach(edge => _addEdge(this, edge))
    } else {
      _addEdge(this, edge)
    }
  }

  function _addEdge (cy, edge) {
    cy.add(edge)
  }
}
