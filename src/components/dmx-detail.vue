<template>
  <div :class="['dmx-detail', {selected}, {locked}]" :data-detail-id="detail.id" :style="style">
    <div class="button-panel">
      <el-button :class="['lock', 'fa', lockIcon]" type="text" :title="lockTitle" @click="toggleLocked"></el-button>
      <el-button :class="['pin', {unpinned: !pinned}, 'fa', 'fa-thumb-tack']" type="text" :title="pinTitle"
        @click="togglePinned">
      </el-button>
    </div>
    <!--
      Note: apparently "object" (a required "object" prop in child comp) can go away in an earlier update cycle
      than "detailNode" (the visibility predicate in parent comp). So we have to put v-if="object" here.
      TODO: approve this hypothesis. ### FIXDOC
    -->
    <dmx-object-renderer class="scroll-container" v-if="object" :object="object" :writable="writable" mode="info"
      :renderers="detailRenderers" :quill-config="_quillConfig"
      @inline="setInlineId" @child-topic-reveal="revealChildTopic" @updated="updated">
    </dmx-object-renderer>
  </div>
</template>

<script>
import {mapState} from 'vuex'
import dmx from 'dmx-api'

export default {

  created () {
    // console.log('dmx-detail created')
  },

  mounted () {
    // console.log('dmx-detail mounted')
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
      locked: true,
      // The component used as event emitter; it's the topicmap renderers parent component
      parent: this.$parent.$parent.$parent
    }
  },

  computed: {

    // Note: 'dmx.topicmaps.topicmap' is the URI of the Topicmap Type this topicmap renderer is able to render.
    // The dmx-topicmap-panel module registers this topicmap renderer's store module by this URI.
    selection () {
      return this.$store.state['dmx.topicmaps.topicmap'].selection
    },

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
      const bb  = this.detail.bb
      const pos = {x: bb.x1, y: bb.y2}
      return {
        top:  `${pos.y}px`,
        left: `${pos.x}px`,
        'background-color': this.object.backgroundColor
      }
    },

    lockIcon () {
      return this.locked ? 'fa-lock' : 'fa-unlock'
    },

    lockTitle () {
      return this.locked ? 'Unlock to interact with content' : 'Lock to interact with ' + this.objectKind
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
        const event = this.object.isTopic ? 'topic-pin' : 'assoc-pin'
        this.parent.$emit(event, {id: this.object.id, pinned})
      }
    },

    objectKind () {
      return this.object.isTopic ? 'topic' : 'association'
    },

    // principle copy in dmx-info-tab.vue (dmx-detail-panel)
    _quillConfig () {
      const _quillConfig = dmx.utils.clone(this.quillConfig)
      _quillConfig.options.bounds = '.dmx-topicmap-panel'
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
    'dmx-object-renderer': require('dmx-object-renderer').default
  }
}
</script>

<style>
.dmx-detail {
  position: absolute;
  border: 1px solid var(--border-color-lighter);
}

.dmx-detail.selected {
  border-color: var(--highlight-color);
}

.dmx-detail.locked {
  pointer-events: none;
}

.dmx-detail .scroll-container {
  min-width: 120px;
  max-width: 360px;
  max-height: 560px;
  padding: 0 12px 12px 12px;
  overflow: auto;
}

.dmx-detail .dmx-object-renderer {
  margin-top: 12px;
}

.dmx-detail .dmx-object-renderer a {
  pointer-events: initial;
}

.dmx-detail.locked .dmx-value-renderer .field {
  background-color: unset !important;                       /* fields of locked details never get white background */
}

.dmx-detail.locked .dmx-value-renderer button.reveal,       /* locked details never show the "Reveal" button */
.dmx-detail.locked .dmx-value-renderer button.edit {        /* locked details never show the "Edit" button */
  visibility: hidden;
}

.dmx-detail.locked .dmx-value-renderer .dmx-child-topic {   /* child topics of locked details never get blue border */
  border-color: transparent;
}

.dmx-detail .button-panel {
  position: absolute;
  top: 0;
  right: 16px;
  width: 46px;
  height: 24px;
  pointer-events: initial;
}

.dmx-detail .button-panel button {
  visibility: hidden;
  position: absolute;
  top: 1px;
  font-size: 16px !important;
  padding: 0 !important;
}

.dmx-detail .button-panel:hover button {
  visibility: visible;
}

.dmx-detail .button-panel button.lock {
  right: 4px;
}

.dmx-detail .button-panel button.pin {
  right: 25px;
}

.dmx-detail .button-panel button.pin.unpinned {
  color: transparent;
  font-size: 15px !important;
  -webkit-text-stroke: 1px var(--highlight-color);
}
</style>
