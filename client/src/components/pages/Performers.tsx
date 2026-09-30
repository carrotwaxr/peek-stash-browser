import EntityListPage from "../list/EntityListPage";
import { PERFORMER_LIST } from "../list/listPageConfigs";

/** The performers list: the shared list page with the performers config */
const Performers = () => <EntityListPage config={PERFORMER_LIST} />;

export default Performers;
