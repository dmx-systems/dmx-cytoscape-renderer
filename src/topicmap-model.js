import dm5 from 'dm5'

const actions = {
  fetchTopicmap (_, id) {
    console.log('Loading topicmap', id)
    return dm5.restClient.getTopicmap(id)
  }
}

export default {
  actions
}
