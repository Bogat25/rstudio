/*
 * SessionVersionTests.cpp
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

#include <gtest/gtest.h>
#include <session/SessionVersion.hpp>

namespace rstudio {
namespace session {

TEST(SessionVersionTest, ReleasesAndUnnumberedPrereleasesHaveNoTrailingDot)
{
   EXPECT_EQ("0.1.0", numericRStudioVersion("0", "1", "0", ""));
   EXPECT_EQ("0.1.0", numericRStudioVersion("0", "1", "0", "-dev"));
}

TEST(SessionVersionTest, DottedPrereleasesHaveNoEmptyComponents)
{
   EXPECT_EQ("0.2.0.1", numericRStudioVersion("0", "2", "0", "-rc.1"));
   EXPECT_EQ("0.2.0.1.2", numericRStudioVersion("0", "2", "0", "-alpha.1.2"));
   EXPECT_EQ("0.2.0.1", numericRStudioVersion("0", "2", "0", "-alpha.beta.1"));
}

TEST(SessionVersionTest, WindowsRevisionIsPreserved)
{
   EXPECT_EQ("0.1.8.1", numericRStudioVersion("0", "1", "8", ".1"));
   EXPECT_EQ("0.1.8.1.2", numericRStudioVersion("0", "1", "8", ".1-rc.2"));
   EXPECT_EQ("0.1.8.1.2", numericRStudioVersion("0", "1", "8", ".1-rc2"));
}

TEST(SessionVersionTest, UpstreamBuildNumbersAndCompactPrereleasesArePreserved)
{
   EXPECT_EQ("2026.08.0.999", numericRStudioVersion("2026", "08", "0", "-dev+999"));
   EXPECT_EQ("2026.08.0.999.1", numericRStudioVersion("2026", "08", "0", "-dev+999.pro1"));
   EXPECT_EQ("0.2.0.12", numericRStudioVersion("0", "2", "0", "-rc12"));
}

} // namespace session
} // namespace rstudio
