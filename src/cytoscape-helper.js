import cytoscape from 'cytoscape'
import coseBilkent from 'cytoscape-cose-bilkent'
import cxtmenu from 'cytoscape-cxtmenu'
import fa from 'font-awesome/fonts/fontawesome-webfont.svg'
import dm5 from 'dm5'

// get style from CSS variables
const style = window.getComputedStyle(document.body)
const FONT_FAMILY          = style.getPropertyValue('--main-font-family')
const MAIN_FONT_SIZE       = style.getPropertyValue('--main-font-size')
const LABEL_FONT_SIZE      = style.getPropertyValue('--label-font-size')
const ICON_COLOR           = style.getPropertyValue('--color-topic-icon')
const HOVER_BORDER_COLOR   = style.getPropertyValue('--color-topic-hover')
const BACKGROUND_COLOR     = style.getPropertyValue('--background-color')
const BORDER_COLOR_LIGHTER = style.getPropertyValue('--border-color-lighter')

var box         // the measurement box
var faFont      // Font Awesome SVG <font> element

const svgReady = dm5.restClient.getXML(fa).then(svg => {
  // console.log('### SVG ready!')
  faFont = svg.querySelector('font')
})

// register extensions
cytoscape.use(coseBilkent)
cytoscape.use(cxtmenu)

export default class CytoscapeHelper {

  constructor (container, _box) {
    this.cy = instantiateCy(container)
    this.svgReady = svgReady
    box = _box
  }
}

function instantiateCy (container) {
  return cytoscape({
    container,
    style: [
      {
        selector: 'node',
        style: {
          'shape': 'rectangle',
          'background-image': ele => renderNode(ele).url,
          'background-opacity': 0,
          'width':  ele => renderNode(ele).width,
          'height': ele => renderNode(ele).height,
          'border-width': 1,
          'border-color': BORDER_COLOR_LIGHTER,
          'border-opacity': 1
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 3,
          'line-color': 'rgb(178, 178, 178)',
          'curve-style': 'bezier',
          'label': 'data(label)',
          'font-family': FONT_FAMILY,
          'font-size': LABEL_FONT_SIZE,
          'text-margin-y': '-10',
          'text-rotation': 'autorotate'
        }
      },
      {
        selector: 'node:selected, node.aux',
        style: {
          'border-opacity': 0
        }
      },
      {
        selector: 'edge:selected',
        style: {
          'width': 6
        }
      },
      {
        selector: 'node.hover',
        style: {
          'border-width': 3,
          'border-color': HOVER_BORDER_COLOR,
          'border-opacity': 1
        }
      }
    ],
    layout: {
      name: 'preset'
    },
    wheelSensitivity: 0.2
  })
}

// TODO: memoization
function renderNode (ele) {
  const label = ele.data('label')
  const iconPath = faGlyphPath(ele.data('icon'))
  const size = measureText(label)
  const width = size.width + 32
  const height = size.height + 8
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect x="0" y="0" width="${width}" height="${height}" fill="${BACKGROUND_COLOR}"></rect>
      <text x="26" y="${height - 7}" font-family="${FONT_FAMILY}" font-size="${MAIN_FONT_SIZE}">${label}</text>
      <path d="${iconPath}" fill="${ICON_COLOR}" transform="scale(0.009 -0.009) translate(600 -2000)"></path>
    </svg>`
  return {
    url: 'data:image/svg+xml,' + encodeURIComponent(svg),
    width, height
  }
}

function faGlyphPath (unicode) {
  try {
    return faFont.querySelector(`glyph[unicode="${unicode}"]`).getAttribute('d')
  } catch (e) {
    throw Error(`FA glyph "${unicode}" not available (${e})`)
  }
}

function measureText (text) {
  box.textContent = text
  return {
    width: box.clientWidth,
    height: box.clientHeight
  }
}
