import { useMemo } from "react";
import { CardStatusIcons } from "../ui/index.js";

/**
 * Scene stats: o counter, play count, organized, resolution, file size
 */
const SceneStats = ({
  scene,
  watchHistory,
  className = "",
  centered = false, // Center the stats
  isReadOnly = false,
}) => {
  const classNames = useMemo(() => {
    const classes = ["flex-nowrap"];
    if (centered) classes.push("justify-center");
    if (className) classes.push(className);
    return classes.join(" ");
  }, [centered, className]);

  return (
    <CardStatusIcons
      className={classNames}
      isReadOnly={isReadOnly}
      oCount={scene.o_counter}
      playCount={watchHistory?.playCount ?? scene.play_count}
      sceneId={scene.id}
    />
  );
};

export default SceneStats;
