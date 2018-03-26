<template>
  <div class="dm5-detail-layer">
    <dm5-detail v-for="detail in details" :detail="detail" :zoom="zoom" :object-renderers="objectRenderers"
      :quill-config="quillConfig" :key="detail.node.id()" @object-submit="submitObject"
      @child-topic-reveal="revealChildTopic">
    </dm5-detail>
  </div>
</template>

<script>
export default {

  mixins: [
    require('./mixins/object-renderers').default
  ],

  props: {
    quillConfig: Object,
    zoom: Number
  },

  computed: {
    details () {
      return this.$store.state.cytoscapeRenderer.details
    }
  },

  methods: {

    submitObject (object) {
      this.$emit('object-submit', object)
    },

    revealChildTopic (relTopic) {
      this.$emit('child-topic-reveal', relTopic)
    }
  },

  components: {
    'dm5-detail': require('./dm5-detail').default
  }
}

</script>

<style>
.dm5-detail-layer {
  position: absolute;
  width: 10000px;     /* avoid early line wrapping */
  top: 0;
}
</style>
