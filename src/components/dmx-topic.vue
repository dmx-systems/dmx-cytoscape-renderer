<template>
  <div :class="classes" :data-id="viewTopic.id" :style="style">
    <span class="fa icon" :style="iconStyle">{{viewTopic.icon}}</span>
    <span>{{label}}</span>
  </div>
</template>

<script>
const MAX_LABEL_LENGTH = 64     // chars

export default {

  props: {
    viewTopic: {type: Object, required: true}
  },

  computed: {

    classes () {
      return ['dmx-topic', {selected: this.selected}, ...this.topicClasses || []]
    },

    style () {
      return {
        top:  `${this.viewTopic.pos.y * this.zoom + this.topicmap.panY}px`,
        left: `${this.viewTopic.pos.x * this.zoom + this.topicmap.panX}px`,
        transform: `scale(${this.zoom}) translate(-50%, -50%)`,
        backgroundColor: this.viewTopic.backgroundColor
      }
    },

    iconStyle () {
      return {
        color: this.viewTopic.iconColor
      }
    },

    label () {
      let label = this.viewTopic.value.toString()
      label = label.length > MAX_LABEL_LENGTH ? label.substr(0, MAX_LABEL_LENGTH) + '…' : label
      return label
    },

    selected () {
      return this.selection.includesId(this.viewTopic.id)
    },

    zoom () {
      return this.topicmap.zoom
    },

    topicmap () {
      return this.$store.state['dmx.topicmaps.topicmap'].topicmap
    },

    selection () {
      return this.$store.state['dmx.topicmaps.topicmap'].selection
    },

    topicClasses () {
      return this.$store.state['dmx.topicmaps.topicmap'].topicClasses[this.viewTopic.id]
    }
  }
}
</script>

<style>
.dmx-topic {
  position: absolute;
  padding: 4px 5px;
  border: 1px solid var(--border-color-lighter);
  transform-origin: top left;
  pointer-events: none;
}

.dmx-topic.selected, .dmx-topic.eh-source, .dmx-topic.eh-target, .dmx-topic.hover {
  border: 2px solid var(--highlight-color);
}

.dmx-topic .icon {
  font-size: 16px;
  margin-right: 4px;
  vertical-align: text-bottom;
}
</style>
