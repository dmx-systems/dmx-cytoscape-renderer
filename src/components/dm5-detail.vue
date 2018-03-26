<template>
  <div :class="['dm5-detail', {selected}, {locked}]" :data-detail-id="detail.id" :style="style">
    <h3>{{object.value}}</h3>
    <!--
      Note: apparently "object" (a required "object" prop in child comp) can go away in an earlier update cycle
      than "detailNode" (the visibility predicate in parent comp). So we have to put v-if="object" here.
      TODO: approve this hypothesis. ### FIXDOC
    -->
    <dm5-object-renderer v-if="object" :object="object" :writable="writable" mode="info" :renderers="objectRenderers"
      :quill-config="_quillConfig" @inline="setInlineId" @child-topic-reveal="revealChildTopic" @updated="updated">
    </dm5-object-renderer>
    <div class="button-panel">
      <el-button :class="['lock', 'fa', lockIcon]" type="text" @click="toggleLocked"></el-button>
      <el-button class="collapse fa fa-compress" type="text" @click="collapse"></el-button>
      <el-button :class="['pin', {unpinned: !pinned}, 'fa', 'fa-thumb-tack']" type="text" @click="togglePinned">
      </el-button>
      <el-button class="handle fa fa-bars" type="text" @contextmenu.native.prevent="handle"></el-button>
    </div>
  </div>
</template>

<script>
import dm5 from 'dm5'

export default {

  created () {
    // console.log('dm5-detail created')
  },

  mounted () {
    // console.log('dm5-detail mounted')
  },

  mixins: [
    require('./mixins/object-renderers').default
  ],

  props: {
    detail: {type: Object, required: true},
    zoom:   {type: Number, required: true},
    quillConfig: Object
  },

  data: () => ({
    locked: true
  }),

  computed: {

    // TODO: use Vuex mapState() helper. Requires object spread operator. Currently our Babel is too old.

    topicmap () {
      return this.$store.state.cytoscapeRenderer.topicmap
    },

    ele () {
      return this.$store.state.cytoscapeRenderer.ele
    },

    object () {
      return this.detail.object
    },

    writable () {
      return this.detail.writable
    },

    selected () {
      return this.ele && id(this.ele) === this.detail.id
    },

    style () {
      return {
        top:  this.pos.y + 'px',
        left: this.pos.x + 'px',
        transform: `scale(${this.zoom})`
      }
    },

    pos () {
      const p = this.detail.node.renderedPosition()
      const pos = {x: p.x, y: p.y}
      const size = this.detail.size
      if (size) {
        pos.x -= size.width  / 2
        pos.y -= size.height / 2
      } else {
        // console.warn('detail size not yet known', this.detail.node.id())
      }
      return pos
    },

    lockIcon () {
      return this.locked ? 'fa-lock' : 'fa-unlock'
    },

    pinned: {
      get () {
        return this.detail.pinned
      },
      set (pinned) {
        if (this.detail.ele.isNode()) {
          // TODO: decoupling. Emit events instead of dispatching actions.
          this.$store.dispatch('setTopicPinned', {topicId: this.object.id, pinned})
        } else {
          // TODO: decoupling. Emit events instead of dispatching actions.
          this.$store.dispatch('setAssocPinned', {assocId: this.object.id, pinned})
        }
      }
    },

    // principle copy in dm5-info-tab.vue (dm5-detail-panel)
    _quillConfig () {
      const _quillConfig = dm5.utils.clone(this.quillConfig)
      _quillConfig.options.bounds = '.dm5-topicmap-panel'
      return _quillConfig
    }
  },

  methods: {

    toggleLocked () {
      this.locked = !this.locked
    },

    togglePinned () {
      this.pinned = !this.pinned
    },

    collapse () {
      // TODO: drop it?
    },

    handle (e) {
      // e.target.style.pointerEvents = 'none'
      console.log('handle', e)
      this.detail.node.emit('taphold', {x: e.x, y: e.y})
    },

    setInlineId (id) {
      if (!id) {
        this.$emit('object-submit', this.object)
      }
    },

    revealChildTopic (relTopic) {
      this.$emit('child-topic-reveal', relTopic)
    },

    updated () {
      this.$store.dispatch('_syncDetailSize', this.detail.id)
    }
  },

  components: {
    'dm5-object-renderer': require('dm5-object-renderer').default
  }
}

// copy in cytoscape-renderer.js and dm5.cytoscape-renderer.vue
function id (ele) {
  // Note: cytoscape element IDs are strings
  return Number(ele.id())
}
</script>

<style>
.dm5-detail {
  position: absolute;
  background-color: var(--background-color);
  border: 1px solid var(--border-color-lighter);
  padding: 0 12px 12px 12px;
  min-width: 120px;
  max-width: 360px;
}

.dm5-detail.selected {
  border-color: var(--color-danger);
}

.dm5-detail.locked {
  pointer-events: none;
}

.dm5-detail .button-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 98px;
  height: 30px;
  pointer-events: initial;
}

.dm5-detail .button-panel button {
  visibility: hidden;
  position: absolute;
  top: 1px;
  font-size: 16px !important;
  padding: 0;
}

.dm5-detail .button-panel:hover button {
  visibility: visible;
}

.dm5-detail .button-panel button.lock {
  right: 71px;
}

.dm5-detail .button-panel button.collapse {
  right: 47px;
}

.dm5-detail .button-panel button.pin {
  right: 27px;
}

.dm5-detail .button-panel button.pin.unpinned {
  color: transparent;
  font-size: 15px !important;
  -webkit-text-stroke: 1px var(--highlight-color);
}

.dm5-detail .button-panel button.handle {
  right: 3px;
}
</style>
