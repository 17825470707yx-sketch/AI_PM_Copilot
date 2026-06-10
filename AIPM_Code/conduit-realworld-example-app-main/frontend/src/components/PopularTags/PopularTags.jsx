import { useContext } from 'react';
import { FeedContext } from '../../context/FeedContext';
import TagButton from './TagButton';

const PopularTags = () => {
  const { tags } = useContext(FeedContext);

  if (!tags) {
    return (
      <div className="col-md-3">
        <div className="sidebar">
          <p>Loading popular tags...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="col-md-3">
      <div className="sidebar">
        <p>Popular Tags</p>
        <div className="tag-list">
          {tags.map((tag) => (
            <TagButton tag={tag} key={tag} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default PopularTags;