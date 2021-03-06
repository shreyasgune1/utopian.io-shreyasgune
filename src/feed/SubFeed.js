import React from "react";
import PropTypes from "prop-types";
import {connect} from "react-redux";
import * as Actions from "../actions/constants";
import Feed from "./Feed";
import EmptyFeed from "../statics/EmptyFeed";
import ScrollToTop from "../components/Utils/ScrollToTop";
import {getIsAuthenticated, getAuthenticatedUser} from "../reducers";
// @UTOPIAN
import {getContributions} from "../actions/contributions";
import {getModerators} from "../actions/moderators";
import {Tabs, Icon} from "antd";
import * as R from "ramda";
const TabPane = Tabs.TabPane;

@connect(
  state => ({
    authenticated: getIsAuthenticated(state),
    user: getAuthenticatedUser(state),
    contributions: state.contributions,
    loading: state.loading,
    moderators: state.moderators,
  }),
  {
    getContributions,
    getModerators
  },
)
class SubFeed extends React.Component {
  static propTypes = {
    authenticated: PropTypes.bool.isRequired,
    user: PropTypes.shape().isRequired,
    match: PropTypes.shape().isRequired,
    moderators: PropTypes.array,
  };

  state = {
    skip: 0,
  };

  constructor(props) {
    super(props);
    this.loadContributions = this.loadContributions.bind(this);
    this.total = 0;
  }

  isModerator () {
    const { moderators, user } = this.props;
    return R.find(R.propEq('account', user.name))(moderators)
  }

  componentWillMount() {
    const { getModerators, match, history } = this.props;
    getModerators();

    if (match.params.status && !this.isModerator()) {
      history.push('/all/review');
    }
  }

  componentDidMount() {
    this.loadContributions();
  }

  loadContributions (nextProps = false) {
    const { match, getContributions, user } = nextProps || this.props;
    const skip =  nextProps ? 0 : this.state.skip;
    const limit = 20;
    this.total = nextProps ? 0 : this.total;

    if (match.params.projectId) {
      getContributions({
        limit,
        skip,
        section: 'project',
        sortBy: 'created',
        platform: match.params.platform,
        projectId: match.params.projectId,
        type: match.params.type || 'all'
      }).then(res => {
        this.total = res.response.total;
        this.setState({skip: skip + limit});
      });
    } else if (match.path === '/@:name') {
      getContributions({
        limit,
        skip,
        section: 'author',
        sortBy: 'created',
        author: match.params.name,
      }).then(res => {
        this.total = res.response.total;
        this.setState({skip: skip + limit});
      });
    } else if (match.params.filterBy === 'review') {
      getContributions({
        limit,
        skip,
        section: 'all',
        sortBy: 'created',
        filterBy: 'review',
        status: this.isModerator() && match.params.status === 'pending' ? 'pending' : 'any',
        moderator: user.name || 'any',
        type: match.params.type || 'all',
      }).then(res => {
        this.total = res.response.total;
        this.setState({skip: skip + limit});
      });
    } else {
      getContributions({
        limit,
        skip,
        section: 'all',
        sortBy: 'created',
        filterBy: match.params.filterBy || 'any',
        type: match.params.type || 'all'
      }).then(res => {
        this.total = res.response.total;
        this.setState({skip: skip + limit});
      });
    }
  }

  renderContributions () {
    const { contributions, match, user } = this.props;

    const filteredContributions = contributions.filter(contribution => {
      if (match.params.projectId) {
        if (match.params.type === 'all') {
          return contribution.json_metadata.repository.id === parseInt(match.params.projectId) &&
            contribution.reviewed === true && !contribution.flagged;
        }else if (match.params.type === 'announcements') {
          return contribution.json_metadata.repository.id === parseInt(match.params.projectId) &&
            contribution.reviewed === true && !contribution.flagged &&
            contribution.json_metadata.type.indexOf('announcement') > -1;
        } else {
          return contribution.json_metadata.repository.id === parseInt(match.params.projectId) &&
            contribution.reviewed === true &&
            !contribution.flagged &&
            contribution.json_metadata.type === match.params.type;
        }
      } else if (match.path === '/@:name') {
        return contribution.author === match.params.name &&
          !contribution.flagged &&
          contribution.reviewed === true;
      } else if (match.params.filterBy && match.params.filterBy === 'review') {
        if (match.params.status && match.params.status === 'pending' && this.isModerator()) {
          return contribution.reviewed === false &&
            contribution.pending === true &&
            !contribution.flagged &&
            contribution.moderator === user.name;
        }
        if (match.params.type !== 'all') {
          return contribution.reviewed === false &&
            !contribution.flagged &&
            contribution.json_metadata.type === match.params.type;
        }
        return contribution.reviewed === false &&
          (contribution.moderator !== user.name) && // contributions pending review of logged moderator already in pending review section
          !contribution.flagged;
      } else if (match.params.type && match.params.type !== 'all') {
        return contribution.json_metadata.type === match.params.type &&
          !contribution.flagged &&
          contribution.reviewed === true;
      }
      return contribution.reviewed === true && !contribution.flagged;
    });

    return filteredContributions;
  }


  componentWillReceiveProps (nextProps) {
    const { location } = this.props;

    if (location.pathname !== nextProps.location.pathname) {
      this.total = 0; // @TODO @UTOPIAN antipattern - requires better implementation
      this.loadContributions(nextProps);
    }
  }

  render() {
    const { loading, history, match, location, isModerator } = this.props;
    const contributions = this.renderContributions();
    const isFetching = loading === Actions.GET_CONTRIBUTIONS_REQUEST;
    const hasMore = this.total > contributions.length;


    const goTo = (type) => {
      const { history, location, match } = this.props;

      if (match.params.filterBy && type === 'pending') {
        return history.push(`/all/review/pending`);
      }

      if (match.params.filterBy) {
        return history.push(`/${type}/${match.params.filterBy}`);
      }

      if (match.params.projectId) {
        return history.push(`/project/${match.params.author}/${match.params.project}/${match.params.platform}/${match.params.projectId}/${type}`);
      }

      history.push(`/${type}`);

    }

    return (
      <div>
        <ScrollToTop />
        {match.path !== "/@:name" ?
          <Tabs defaultActiveKey={match.params.type || 'all'} onTabClick={type => goTo(`${type}`)}>
            {this.isModerator() && match.params.filterBy === 'review' ? <TabPane tab={<span><Icon type="safety" />Pending Review</span>} key="pending" /> : null}
            <TabPane tab={<span><Icon type="appstore-o" />All</span>} key="all" />
            {match.params.projectId && <TabPane tab={<span><Icon type="notification" />Announcements</span>} key="announcements" />}
            <TabPane tab={<span><Icon type="bulb" />Ideas</span>} key="ideas" />
            <TabPane tab={<span><Icon type="code" />Development</span>} key="development" />
            <TabPane tab={<span><Icon type="eye-o" />Bug Hunting</span>} key="bug-hunting" />
            <TabPane tab={<span><Icon type="flag" />Translations</span>} key="translations" />
            <TabPane tab={<span><Icon type="layout" />Graphics</span>} key="graphics" />
            <TabPane tab={<span><Icon type="book" />Documentation</span>} key="documentation" />
            <TabPane tab={<span><Icon type="dot-chart" />Analysis</span>} key="analysis" />
            <TabPane tab={<span><Icon type="share-alt" />Visibility</span>} key="social" />
          </Tabs> : null}

        <Feed
          content={ contributions }
          isFetching={ isFetching }
          hasMore={ hasMore }
          loadMoreContent={ this.loadContributions }
        />
        {!contributions.length && !isFetching && <EmptyFeed text={match.params.type === 'announcements' ? 'No announcements yet' : null}/>}
      </div>
    );
  }
}

export default SubFeed;
