<template>
  <div :class="['dm5-detail', {selected}, {insideHandle}]" :data-detail-id="detail.id" :style="style">
    <!--
      Note: apparently "object" (a required "object" prop in child comp) can go away in an earlier update cycle
      than "detailNode" (the visibility predicate in parent comp). So we have to put v-if="object" here.
      TODO: approve this hypothesis. ### FIXDOC
    -->
    <!-- Handle -->
    <el-button class="handle fa fa-bars" type="text" @mouseenter.native="enterHandle"></el-button>
    <!-- Pin Button -->
    <el-button :class="['pin', {unpinned: !pinned}, 'fa', 'fa-thumb-tack']" type="text" :title="pinTitle"
      @click="togglePinned">
    </el-button>
    <!--
      Note: having the buttons before the object renderer reduces flickering when hovering the handle.
      Flickering results from partial overlapping of handle and object renderer. ### FIXME
    -->
    <dm5-object-renderer v-if="object" :object="object" :writable="writable" mode="info" :renderers="detailRenderers"
      :quill-config="_quillConfig" @inline="setInlineId" @child-topic-reveal="revealChildTopic" @updated="updated"
      @mouseenter.native="leaveHandle">
    </dm5-object-renderer>
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
    require('./mixins/detail-renderers').default
  ],

  props: {
    detail: {type: Object, required: true},
    quillConfig: Object
  },

  data () {
    return {
      insideHandle: false,
      // The component used as event emitter; it's the topicmap renderers parent component
      parent: this.$parent.$parent.$parent
    }
  },

  computed: {

    // Note: 'dmx.topicmaps.topicmap' is the URI of the Topicmap Type this topicmap renderer is able to render.
    // The dm5-topicmap-panel module registers this topicmap renderer's store module by this URI.
    ...mapState({
      selection: state => state['dmx.topicmaps.topicmap'].selection,
      zoom:      state => state['dmx.topicmaps.topicmap'].zoom
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
        transform: `scale(${this.zoom})`,
        'background-color': this.object.backgroundColor
      }
    },

    pos () {
      const p = this.detail.pos
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

    pinTitle () {
      return this.pinned ? 'Unpin Details' : 'Pin Details\n\nDetails remain visible even if ' + this.objectKind +
        ' is unselected'
    },

    pinned: {
      get () {
        return this.detail.pinned
      },
      set (pinned) {
        const event = this.object.isTopic() ? 'topic-pin' : 'assoc-pin'
        this.parent.$emit(event, {id: this.object.id, pinned})
      }
    },

    objectKind () {
      return this.object.isTopic() ? 'topic' : 'association'
    },

    // principle copy in dm5-info-tab.vue (dm5-detail-panel)
    _quillConfig () {
      const _quillConfig = dm5.utils.clone(this.quillConfig)
      _quillConfig.options.bounds = '.dm5-topicmap-panel'
      return _quillConfig
    }
  },

  methods: {

    enterHandle () {
      console.log('enterHandle')
      this.insideHandle = true
    },

    leaveHandle () {
      console.log('leaveHandle')
      this.insideHandle = false
    },

    togglePinned () {
      this.pinned = !this.pinned
    },

    setInlineId (id) {
      if (!id) {
        this.parent.$emit('object-submit', this.object)
      }
    },

    revealChildTopic (relTopic) {
      this.parent.$emit('child-topic-reveal', relTopic)
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
  border: 1px solid var(--border-color-lighter);
  padding: 6px 12px 12px 12px;
  min-width: 120px;
  max-width: 360px;
}

.dm5-detail.selected {
  border-color: var(--highlight-color);
}

.dm5-detail.insideHandle {
  pointer-events: none;
}

.dm5-detail .dm5-object-renderer {
  margin-top: 12px;
  pointer-events: initial;
}

.dm5-detail > button {
  position: absolute;
  font-size: 16px !important;
  padding: 0 !important;
}

.dm5-detail > button.handle {
  top: 0px;
  right: 2px;
}

.dm5-detail > button.pin {
  top: 1px;
  right: 25px;
  pointer-events: initial;
}

.dm5-detail > button.pin.unpinned {
  color: transparent;
  font-size: 15px !important;
  -webkit-text-stroke: 1px var(--highlight-color);
}
</style>
