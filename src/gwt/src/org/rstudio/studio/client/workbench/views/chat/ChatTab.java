/*
 * ChatTab.java
 *
 * Copyright (C) 2025 by Posit Software, PBC
 *
 * This program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */
package org.rstudio.studio.client.workbench.views.chat;

import org.rstudio.core.client.command.CommandBinder;
import org.rstudio.core.client.command.Handler;
import org.rstudio.studio.client.workbench.commands.Commands;
import org.rstudio.studio.client.workbench.model.Session;
import org.rstudio.studio.client.workbench.ui.DelayLoadTabShim;
import org.rstudio.studio.client.workbench.ui.DelayLoadWorkbenchTab;

import com.google.inject.Inject;

public class ChatTab extends DelayLoadWorkbenchTab<ChatPresenter>
{
   public interface Binder extends CommandBinder<Commands, Shim> {}

   public abstract static class Shim extends DelayLoadTabShim<ChatPresenter, ChatTab>
   {
      @Handler
      public abstract void onActivateChat();

      @Handler
      public abstract void onAssistantPaneToggle();

      @Handler
      public abstract void onCheckForPositAssistantUpdates();
   }

   @Inject
   public ChatTab(Shim shim, Binder binder, Commands commands, Session session)
   {
      super(constants_.chatTitle(), shim);
      shim_ = shim;

      binder.bind(commands, shim_);

      // Load only when invoked by the keyboard shortcut. Saved satellite state
      // deliberately does not restore a window or start the assistant.
   }

   private final Shim shim_;
   private static final ChatConstants constants_ = com.google.gwt.core.client.GWT.create(ChatConstants.class);
}
