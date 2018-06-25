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
      <el-button :class="['pin', {unpinned: !pinned}, 'fa', 'fa-thumb-tack']" type="text" @click="togglePinned">
      </el-button>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'
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

  data () {
    return {
      locked: true
    }
  },

  computed: {

    ...mapState({
      selection: state => state['dm4.webclient.default_topicmap_renderer'].selection
    }),

    object () {
      return this.detail.object
    },

    writable () {
      return this.detail.writable
    },

    selected () {
      return this.selection.includesId(this.detail.id)
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
  border-color: var(--highlight-color);
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
  padding: 0 !important;
}

.dm5-detail .button-panel:hover button {
  visibility: visible;
}

.dm5-detail .button-panel button.lock {
  right: 4px;
}

.dm5-detail .button-panel button.pin {
  right: 25px;
}

.dm5-detail .button-panel button.pin.unpinned {
  color: transparent;
  font-size: 15px !important;
  -webkit-text-stroke: 1px var(--highlight-color);
}
</style>
