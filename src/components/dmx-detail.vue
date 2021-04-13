<template>
  <div :class="['dmx-detail', {selected}]" :data-detail-id="detail.id" :style="style">
    <el-button :class="['pin', {unpinned: !pinned}, 'fa', 'fa-thumb-tack']" type="text" :title="pinTitle"
      @click="togglePinned">
    </el-button>
    <!--
      Note: apparently "object" (a required "object" prop in child comp) can go away in an earlier update cycle
      than "detailNode" (the visibility predicate in parent comp). So we have to put v-if="object" here.
      TODO: approve this hypothesis. ### FIXDOC
    -->
    <dmx-object-renderer v-if="object" :object="object" :writable="writable" mode="info"
      :no-heading="true" :renderers="detailRenderers" :quill-config="_quillConfig"
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

    zoom () {
      return this.$store.state['dmx.topicmaps.topicmap'].zoom
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
      const o = {x: 0, y: 0}
      const size = this.detail.size
      if (size) {
        // distance between top/left and scaled top/left; Note: "transform scale" grows/shrinks element from center
        o.x = (size.width - size.width * this.zoom) / 2
        o.y = (size.height - size.height * this.zoom) / 2
      }
      const bbr = this.detail.bbr
      return {
        // align detail DOM's top with detail node's bottom
        top:  `${bbr.y2 - o.y}px`,
        left: `${bbr.x1 - o.x}px`,
        transform: `scale(${this.zoom})`,
        'background-color': this.object.backgroundColor
      }
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

.dmx-detail .dmx-object-renderer {
  min-width: 120px;
  max-width: 360px;
  max-height: 560px;
  margin-top: 20px;
  padding: 0 18px 12px 12px;
  overflow: auto;
}

.dmx-detail button.pin {
  position: absolute;
  top: 1px;
  right: 2px;
  font-size: 16px !important;
  padding: 0 !important;
}

.dmx-detail  button.pin.unpinned {
  color: transparent;
  font-size: 15px !important;
  -webkit-text-stroke: 1px var(--highlight-color);
}
</style>
