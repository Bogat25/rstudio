#ifndef SESSION_CHAT_LOCAL_HPP
#define SESSION_CHAT_LOCAL_HPP

#include <algorithm>
#include <string>
#include <vector>

namespace rstudio {
namespace session {
namespace modules {
namespace chat {
namespace local {

inline const std::vector<std::string>& capabilities()
{
   static const std::vector<std::string> methods = {
      "protocol/getVersion",
      "runtime/getConsoleContent",
      "workspace/getCurrentScript",
      "workspace/getLocalSettings",
      "workspace/insertAtCursor",
      "workspace/insertIntoNewFile",
      "ui/getCurrentPlot"
   };
   return methods;
}

inline bool permitsRequest(const std::string& method)
{
   const auto& methods = capabilities();
   return std::find(methods.begin(), methods.end(), method) != methods.end();
}

} // namespace local
} // namespace chat
} // namespace modules
} // namespace session
} // namespace rstudio

#endif
