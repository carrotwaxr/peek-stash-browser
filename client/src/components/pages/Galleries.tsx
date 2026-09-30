import EntityListPage from "../list/EntityListPage";
import { GALLERY_LIST } from "../list/listPageConfigs";

/** The galleries list: the shared list page with the galleries config */
const Galleries = () => <EntityListPage config={GALLERY_LIST} />;

export default Galleries;
