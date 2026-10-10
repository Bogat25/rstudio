/*
 * SessionVersion.hpp
 *
 * Copyright (C) 2026 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

#ifndef SESSION_VERSION_HPP
#define SESSION_VERSION_HPP

#include <string>

namespace rstudio {
namespace session {

// R's package_version() accepts numeric components only. Retain numbers from
// the suffix, without creating empty components for "rc.1", "dev", or a release.
// Keep a Windows revision separate from prerelease digits in ".1-rc2".
inline std::string numericRStudioVersion(const std::string& major,
                                        const std::string& minor,
                                        const std::string& patch,
                                        const std::string& suffix)
{
   std::string version = major + "." + minor + "." + patch;
   std::string component;
   for (char ch : suffix)
   {
      if (ch >= '0' && ch <= '9')
         component += ch;
      else if ((ch == '.' || ch == '-') && !component.empty())
      {
         version += "." + component;
         component.clear();
      }
   }
   if (!component.empty())
      version += "." + component;
   return version;
}

} // namespace session
} // namespace rstudio

#endif // SESSION_VERSION_HPP
